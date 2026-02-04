import { Alarm, CloudSettings, Device, DeviceClass, DeviceFirmware, DeviceFirmwareBinary } from '@interfaces/device.interface';
import deviceModel from '@models/device.model';
import deviceLogModel from '@models/devicelog.model';
import deviceClassModel from '@/models/deviceclass.model';
import { deviceFirmwareBinaryModel, deviceFirmwareModel } from '@/models/devicefirmware.model';
import claimCodeModel from '@/models/claimcode.model';
import { v4 as uuidv4 } from 'uuid';
import { AddDeviceDto, RegisterDeviceDto, TestDeviceDto } from '@/dtos/device.dto';
import { mqttclient } from '../databases/mqttclient';
import { dataService } from './data.service';
import { HttpException } from '@/exceptions/HttpException';
import { ENABLE_SELF_REGISTRATION, SELF_REGISTRATION_PASSWORD, SMTP_SENDER } from '@/config';
import { alarmService } from '@services/alarm.service';
import { isNumeric } from 'influx/lib/src/grammar';
import { mailTransport } from '@services/auth.service';
import { execFile } from 'node:child_process';
import imageModel from '@models/images.model';
import pLimit from 'p-limit';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { Image } from '@interfaces/images.interface';
import { deviceService } from '@services/device.service';
import { createServer } from 'node:net';
import { tunnelService } from '@services/tunnel.service';

export type StatusMessage = {
  sensors: {
    [key: string]: number;
  };
  outputs: {
    [key: string]: number;
  };
  timestamp: number;
};

const MS_IN_A_DAY = 24 * 60 * 60 * 1000;

const IMAGE_LOAD_INTERVAL_MS = 30000;
const COMPRESS_INTERVAL_MS = 60 * 60 * 1000;

const FFMPEG_THROTTLE_MS = 1000;
const FFMPEG_TIMEOUT_MS = 90000;
const IMAGE_RETENTION_DAYS = 3 * 365;

const TIMELAPSE_DAY_FRAMEINTERVAL_MS = 2 * 60 * 1000;
const TIMELAPSE_FRAME_RATE = 25;

type RtspStreamTxData = {
  connection_id: string;
  host: string;
  port: number;
} & ({ disconnected: true; payload?: string } | { disconnected?: false; payload: string });

type RtspStreamRxData = Pick<RtspStreamTxData, 'connection_id' | 'payload' | 'disconnected'> & {
  sequence: number;
};

type RtspConnectionData = {
  nextSequence: number;
  lastActivityTime: number;
  handler: (payload: RtspStreamRxData['payload']) => void;
  queue: RtspStreamRxData[];
  handleDisconnect: () => void;
};

class ImageService {
  private ffmpegLimit = pLimit(10);
  private deviceIdToLastRtspImageTimestamps = new Map<string, number>();
  private deviceIdToRtspClient = new Map<string, Map<string, RtspConnectionData>>();

  constructor() {
    setTimeout(() => {
      void this.readFromRtspStreams();
    }, 30_000);
    setTimeout(() => {
      void this.compressRtspStreams();
    }, 300_000);
  }

  public async getDeviceImage(device_id: string, format: string, timestamp?: number, duration?: string): Promise<Image | undefined> {
    return imageModel
      .findOne({
        device_id,
        format: { $eq: format as 'jpeg' | 'mp4' },
        timestamp: { $lte: timestamp ? timestamp : Date.now() },
        duration: (duration as '1d' | '1w' | '1m') || undefined,
      })
      .sort({ timestamp: -1 });
  }

  private async readFromRtspStreams(): Promise<void> {
    const devices = await deviceModel.find({
      'cloudSettings.rtspStream': { $exists: true, $ne: '' },
    });

    const promises: Promise<void>[] = [];
    for (const device of devices) {
      if ((this.deviceIdToLastRtspImageTimestamps.get(device.device_id) ?? 0) <= Date.now() - IMAGE_LOAD_INTERVAL_MS) {
        promises.push(
          this.ffmpegLimit(() =>
            this.readRtspStreamImage(device.cloudSettings, device.device_id)
              .then(
                async image =>
                  void imageModel.create({
                    image_id: uuidv4(),
                    device_id: device.device_id,
                    format: 'jpeg',
                    timestamp: Date.now(),
                    data: image,
                  }),
              )
              .catch(e => {
                console.log(`Error reading RTSP stream ${device.cloudSettings.rtspStream}:`, e?.message);
                return Promise.resolve();
              })
              .finally(() => void this.deviceIdToLastRtspImageTimestamps.set(device.device_id, Date.now())),
          ),
        );
      }

      await new Promise(r => setTimeout(r, FFMPEG_THROTTLE_MS));
    }

    await Promise.all(promises);

    setTimeout(() => {
      void this.readFromRtspStreams();
    }, FFMPEG_THROTTLE_MS);
  }

  private async compressRtspStreams(): Promise<void> {
    try {
      const devices = await deviceModel.find({ 'cloudSettings.rtspStream': { $exists: true, $ne: '' } });

      for (const device of devices) {
        const oldImages = await imageModel
          .find({
            device_id: device.device_id,
            format: 'jpeg',
            timestamp: { $lt: Date.now() - IMAGE_RETENTION_DAYS * MS_IN_A_DAY },
          })
          .select({ image_id: 1 });
        for (const oldImage of oldImages) {
          await imageModel.deleteOne({ image_id: oldImage.image_id });
        }

        await this.compressRtspStreamRange(device, MS_IN_A_DAY, TIMELAPSE_DAY_FRAMEINTERVAL_MS, '1d');
        await this.compressRtspStreamRange(device, 7 * MS_IN_A_DAY, 7 * TIMELAPSE_DAY_FRAMEINTERVAL_MS, '1w');
        await this.compressRtspStreamRange(device, 30 * MS_IN_A_DAY, 30 * TIMELAPSE_DAY_FRAMEINTERVAL_MS, '1m');
      }
    } finally {
      setTimeout(() => {
        void this.compressRtspStreams();
      }, COMPRESS_INTERVAL_MS);
    }
  }

  private async compressRtspStreamRange(
    device: Device,
    timeStep: number,
    minFrameIntervalMs: number,
    targetDuration: '1d' | '1w' | '1m',
  ): Promise<void> {
    let endTimestamp = Math.ceil(Date.now() / timeStep) * timeStep;

    while (true) {
      const compressedImage = await imageModel.findOne({
        device_id: device.device_id,
        format: 'mp4',
        timestamp: endTimestamp - timeStep,
        duration: targetDuration,
      });

      const images = await imageModel
        .find({
          device_id: device.device_id,
          format: 'jpeg',
          timestamp: {
            $lt: endTimestamp,
            $gte: endTimestamp - timeStep,
          },
        })
        .sort({ timestamp: 1 })
        .select({ image_id: 1, timestamp: 1 });

      if (images && (!compressedImage || compressedImage.timestampEnd < images[images.length - 1]?.timestamp)) {
        const video = await this.compressRtspStreamImages(device, images, minFrameIntervalMs);

        if (video) {
          if (compressedImage) {
            await imageModel.deleteOne({ image_id: compressedImage.image_id });
          }

          await imageModel.create({
            image_id: uuidv4(),
            device_id: device.device_id,
            timestamp: endTimestamp - timeStep,
            timestampEnd: images[images.length - 1]?.timestamp,
            data: video,
            format: 'mp4',
            duration: targetDuration,
          });
          endTimestamp -= timeStep;
        } else {
          return;
        }
      } else {
        return;
      }
    }
  }

  private async compressRtspStreamImages(device: Device, images: Omit<Image, 'data'>[], minFrameIntervalMs: number): Promise<Buffer | undefined> {
    const filesWritten = [];
    const tmpDir = await mkdtemp(join(tmpdir(), device.device_id));
    let lastImageTimestamp = 0;

    try {
      let sequenceNumber = 1;
      for (const image of images) {
        if (image.timestamp - lastImageTimestamp < minFrameIntervalMs) {
          continue;
        }

        const imageData = await imageModel.findOne({
          image_id: image.image_id,
          format: 'jpeg',
        });
        if (imageData) {
          // pad sequence number with leading zeros
          const filename = `${tmpDir}/${sequenceNumber++}.jpeg`;
          filesWritten.push(filename);
          await writeFile(filename, imageData.data);
          lastImageTimestamp = image.timestamp;
        }
      }

      if (filesWritten.length > 0) {
        return await this.convertRtspStreamImagesToVideo(tmpDir);
      }
    } catch (e) {
      console.log('Error compressing RTSP images for device ' + device.device_id + ':', e);

      for (const file of filesWritten) {
        try {
          await unlink(file);
        } catch (e) {
          console.log('Error deleting temp file ' + file + ':', e);
        }
      }
      try {
        await unlink(tmpDir);
      } catch (e) {
        console.log('Error deleting temp dir ' + tmpDir + ':', e);
      }
    }

    return undefined;
  }

  private async readRtspStreamImage(cloudSettings: CloudSettings, deviceId: string): Promise<Buffer> {
    let streamUrl = cloudSettings.rtspStream;
    if (cloudSettings.tunnelRtspStream) {
      streamUrl = await tunnelService.createTunnelProxyServer(new URL(cloudSettings.rtspStream), deviceId);
    }

    return new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-y',
          ...(cloudSettings.rtspStream.startsWith('rtsp://') ? ['-rtsp_transport', cloudSettings.rtspStreamTransport ?? 'tcp'] : []),
          '-i',
          streamUrl,
          '-q:v',
          '20',
          '-vframes',
          '1',
          '-f',
          'mjpeg',
          '-',
        ],
        {
          timeout: FFMPEG_TIMEOUT_MS,
          maxBuffer: 5 * 1024 * 1024,
          encoding: 'buffer',
        },
        (error, stdout, stderr) => {
          if (error || !stdout || stdout.length === 0) {
            void deviceService.logMessage(deviceId, {
              title: `RTSP Stream Error`,
              message: 'Failed to fetch image from RTSP stream: ' + stderr,
              severity: 1,
              raw: true,
              categories: ['webcam', 'error'],
            });
            reject(error);
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }

  private convertRtspStreamImagesToVideo(filesDir: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-y',
          '-framerate',
          String(TIMELAPSE_FRAME_RATE),
          '-f',
          'image2',
          '-i',
          `${filesDir}/%d.jpeg`,
          '-f',
          'mp4',
          '-vcodec',
          'libx265',
          '-crf',
          '30',
          `${filesDir}/result.mp4`,
        ],
        {
          timeout: 15 * 60000,
          maxBuffer: 50 * 1024 * 1024,
          encoding: 'buffer',
        },
        (error, stdout, stderr) => {
          if (error) {
            console.log('Error compressing RTSP stream images:', stderr, error);
            reject(error);
          } else {
            readFile(`${filesDir}/result.mp4`)
              .then(data => resolve(data))
              .catch(err => {
                console.log(`Error reading result file ${filesDir}/result.mp4:`, err);
                reject(err);
              })
              .finally(() => unlink(`${filesDir}/result.mp4`).catch(() => Promise.resolve()));
          }
        },
      );
    });
  }
}

export const imageService = new ImageService();
