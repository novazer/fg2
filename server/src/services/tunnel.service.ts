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

const TUNNEL_CHUNK_SIZE = 256;

type TunnelStreamTxData = {
  connection_id: string;
  host: string;
  port: number;
} & ({ disconnected: true; payload?: string } | { disconnected?: false; payload: string });

type TunnelStreamRxData = Pick<TunnelStreamTxData, 'connection_id' | 'payload' | 'disconnected'> & {
  sequence: number;
};

type TunnelConnectionData = {
  nextSequence: number;
  lastActivityTime: number;
  handler: (payload: TunnelStreamRxData['payload']) => void;
  queue: TunnelStreamRxData[];
  handleDisconnect: () => void;
};

class TunnelService {
  private deviceIdToTunnelConnection = new Map<string, Map<string, TunnelConnectionData>>();

  public onTunnelReadDataReceived(device_id: string, data: string): Promise<void> {
    try {
      const parsed: TunnelStreamRxData = JSON.parse(data);

      const connection = this.deviceIdToTunnelConnection.get(device_id)?.get(parsed.connection_id);
      if (!connection) {
        return;
      }

      connection.queue.push(parsed);

      let nextData: TunnelStreamRxData;
      while ((nextData = connection.queue.find(d => d.sequence === connection.nextSequence))) {
        if (nextData.disconnected) {
          connection.handleDisconnect();
          break;
        } else {
          connection.lastActivityTime = Date.now();
          connection.queue = connection.queue.filter(d => d.sequence > nextData.sequence);
          connection.handler(nextData.payload);
        }
        connection.nextSequence++;
      }
    } catch (e) {
      console.log('Error parsing tunnel data received:', e);
    }

    return Promise.resolve();
  }

  public async createTunnelProxyServer(streamUrl: URL, device_id: string): Promise<string> {
    const port = streamUrl.port
      ? parseInt(streamUrl.port)
      : streamUrl.protocol === 'rtsp:'
      ? 554
      : streamUrl.protocol === 'rtsps:'
      ? 322
      : streamUrl.protocol === 'rtmp:'
      ? 1935
      : ['rtmps:', 'https:'].includes(streamUrl.protocol)
      ? 443
      : 80;

    return new Promise<string>((resolve, reject) => {
      const server = createServer(client => {
        const connectionId = uuidv4();
        const dataCallback: TunnelConnectionData['handler'] = payload => {
          if (client.destroyed) {
            return;
          }

          this.reportTunnelActivity(device_id, connectionId);

          client.write(new Uint8Array(Buffer.from(payload, 'base64')), err => {
            if (err) {
              client.destroy(err);
            }
          });
        };

        client.once('close', () => {
          if (!this.moduleHasDisconnected(device_id, connectionId)) {
            const message: TunnelStreamTxData = {
              connection_id: connectionId,
              disconnected: true,
              host: streamUrl.hostname,
              port,
            };
            mqttclient.publish('/devices/' + device_id + '/tunnel_write', JSON.stringify(message));
          }

          this.deviceIdToTunnelConnection.get(device_id)?.delete(connectionId);
        });
        client.setEncoding('binary');
        client.on('data', data => {
          this.reportTunnelActivity(device_id, connectionId);

          if (!this.moduleHasDisconnected(device_id, connectionId)) {
            while (data.length > 0) {
              const chunk = Buffer.from(data.slice(0, TUNNEL_CHUNK_SIZE));
              data = Buffer.from(data.slice(TUNNEL_CHUNK_SIZE));
              const message: TunnelStreamTxData = {
                connection_id: connectionId,
                payload: chunk.toString('base64'),
                host: streamUrl.hostname,
                port,
              };
              mqttclient.publish('/devices/' + device_id + '/tunnel_write', JSON.stringify(message));
            }
          }
        });

        if (!this.deviceIdToTunnelConnection.has(device_id)) {
          this.deviceIdToTunnelConnection.set(device_id, new Map());
        }
        this.deviceIdToTunnelConnection.get(device_id).set(connectionId, {
          handler: dataCallback,
          lastActivityTime: Date.now(),
          nextSequence: 0,
          queue: [],
          handleDisconnect: () => client.destroy(),
        });

        const timeoutAfterActivity = () =>
          setTimeout(() => {
            if (Date.now() - (this.deviceIdToTunnelConnection.get(device_id)?.get(connectionId)?.lastActivityTime || 0) >= 15000) {
              client.destroy();
            } else {
              timeoutAfterActivity();
            }
          }, 1000);
        timeoutAfterActivity();
      });

      server.listen(
        {
          port: 0,
          host: '127.0.0.1',
        },
        () => {
          const url = new URL(streamUrl.toString());
          url.hostname = '127.0.0.1';
          url.port = String((server.address() as any).port);
          console.log('Tunnel proxy server listening on ', (server.address() as any).port, url.toString(), 'to', streamUrl.hostname + ':' + port);
          resolve(url.toString());
        },
      );
      server.on('error', (err: any) => {
        reject(err);
      });

      setTimeout(() => {
        server.close(err => {
          if (err) {
            console.log('Error closing tunnel proxy server on timeout:', err);
          }
        });
        reject(new Error('Timeout creating tunnel proxy server'));
      }, 300_000);
    });
  }

  private reportTunnelActivity(device_id: string, connection_id: string): void {
    const connection = this.deviceIdToTunnelConnection.get(device_id)?.get(connection_id);
    if (connection) {
      connection.lastActivityTime = Date.now();
    }
  }

  private moduleHasDisconnected(device_id: string, connection_id: string): boolean {
    return (
      this.deviceIdToTunnelConnection
        .get(device_id)
        ?.get(connection_id)
        ?.queue?.find(d => d.disconnected)?.disconnected || false
    );
  }
}

export const tunnelService = new TunnelService();
