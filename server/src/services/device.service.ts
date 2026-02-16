import { Alarm, Device, DeviceClass, DeviceClassCount, DeviceFirmware, DeviceFirmwareBinary } from '@interfaces/device.interface';
import deviceModel from '@models/device.model';
import deviceLogModel from '@models/devicelog.model';
import deviceClassModel from '@/models/deviceclass.model';
import { deviceFirmwareModel, deviceFirmwareBinaryModel } from '@/models/devicefirmware.model';
import claimCodeModel from '@/models/claimcode.model';
import { v4 as uuidv4 } from 'uuid';
import { AddDeviceDto, AddDeviceClassDto, AddDeviceFirmwareDto, TestDeviceDto, RegisterDeviceDto } from '@/dtos/device.dto';
import { mqttclient } from '../databases/mqttclient';
import { dataService } from './data.service';
import { HttpException } from '@/exceptions/HttpException';
import {ENABLE_SELF_REGISTRATION, SELF_REGISTRATION_PASSWORD, SMTP_SENDER} from '@/config';
import { alarmService } from '@services/alarm.service';
import * as console from 'node:console';
import {mailTransport} from "@services/auth.service";
import {isNumeric} from "influx/lib/src/grammar";

export type StatusMessage = {
  sensors: {
    [key: string]: number;
  };
  outputs: {
    [key: string]: number;
  };
  timestamp: number;
};

const UPGRADE_TIMEOUT: number = 10 * 60 * 1000;
const ONLINE_TIMEOUT: number = 10 * 60 * 1000;

const devicesInstructed: string[] = [];
let devicesInstructedTime = 0;
const FRIDGE_FIRMWARE_ID = 'a51f4171-d984-4086-ae15-89455e2f71a4';
const FAN_FIRMWARE_ID = 'cb5aa07e-f9ca-45bd-beb9-ccef26844f19';
const PLUG_FIRMWARE_ID = '3e6ffc7d-e476-40fc-904f-e7f4a8f32d7c';
const LIGHT_FIRMWARE_ID = '5b6504ca-94a2-4f31-90b4-7ca270c7310f';
const ALLOWED_FIRMWARES = {
  '52d3335d-c623-4d4f-ade5-931e853ede93': FRIDGE_FIRMWARE_ID,
  'dbc5e840-45eb-444b-8c7d-5f152f657981': FRIDGE_FIRMWARE_ID,
  '901f7cfa-55e2-4176-83aa-627da26792e4': FRIDGE_FIRMWARE_ID,
  'e0d76fc7-38b1-414c-90ba-be0056955586': FRIDGE_FIRMWARE_ID,
  '13cacbc9-af0c-433c-adc9-bcbd1c5a76b2': FAN_FIRMWARE_ID,
};
const detectedFirmwares = [];

const minimal_classes = [
  {
    name: 'fridge',
    description: 'Fridge Controller',
    concurrent: 5,
    maxfails: 10,
  },
  {
    name: 'fan',
    description: 'Fan Controller',
    concurrent: 5,
    maxfails: 10,
  },
  {
    name: 'light',
    description: 'Light Controller',
    concurrent: 5,
    maxfails: 10,
  },
  {
    name: 'plug',
    description: 'Smart Socket',
    concurrent: 5,
    maxfails: 10,
  },
];

class DeviceService {
  constructor() {
    setTimeout(() => {
      this.connectMqtt();
    }, 5000);
    setInterval(async () => {
      await this.findUpgradeableDevices();
    }, 10000);
    this.checkDeviceClasses();
  }

  private async checkDeviceClasses() {
    for (const device_class of minimal_classes) {
      const class_data = await this.findClass(device_class.name);
      if (!class_data) {
        console.log('Adding Device class ' + device_class.name);
        this.createClass(device_class.name, device_class.description, device_class.concurrent, device_class.maxfails, '');
      } else {
        console.log('FOUND CLASS ' + device_class.name);
        console.log(class_data);
      }
    }
  }

  async connectMqtt() {
    try {
      await mqttclient.connect();

      mqttclient.subscribe('/devices/#');
      mqttclient.messages.subscribe(async message => {
        const device_id = message.topic.split('/')[2];
        const topic = message.topic.split('/')[3];
        let newFirmware = undefined;

        switch (topic) {
          case 'fetch':
            let parsedMessage2: any = { content: message.message };
            try {
              parsedMessage2 = JSON.parse(message.message);
            } catch(e) {}
            if (
              parsedMessage2.firmware_id &&
              parsedMessage2.firmware_id != FRIDGE_FIRMWARE_ID &&
              parsedMessage2.firmware_id != FAN_FIRMWARE_ID
            ) {
              if (parsedMessage2.firmware_id in ALLOWED_FIRMWARES) {
                break;
              } else if (parsedMessage2.firmware_id && !detectedFirmwares.includes(parsedMessage2.firmware_id)) {
                detectedFirmwares.push(parsedMessage2.firmware_id);
                console.log('Unknown firmware detected from device ' + device_id + ': ' + parsedMessage2.firmware_id);
                await mailTransport.sendMail({
                  from: SMTP_SENDER,
                  to: SMTP_SENDER,
                  subject: '[FG2] Unknown Firmware detected',
                  text: parsedMessage2.firmware_id + ' on device ' + device_id + '\n\n' + JSON.stringify(message.message) + '\n\n' + message.message,
                });
              }
            }
          case 'log':
          case 'configuration':
            let parsedMessage: any = { content: message.message };
            try {
              parsedMessage = JSON.parse(message.message);
            } catch(e) {}
            console.log('parsedMessage from ' + device_id + ' on ' + topic + ':', parsedMessage instanceof Buffer ? parsedMessage.toString() : parsedMessage);
            return;
          case 'firmware':
            console.log('message from ' + device_id + ' on ' + topic + ':', String(message.message));
          case 'bulk':
          case 'status':
            let parsedMessage3: any = { content: message.message };
            try {
              parsedMessage3 = JSON.parse(message.message);
            } catch(e) {}

            if (isNumeric(parsedMessage3?.outputs?.dehumidifier) && isNumeric(parsedMessage3?.outputs?.heater)) {
              newFirmware = FRIDGE_FIRMWARE_ID;
            } else if (isNumeric(parsedMessage3?.sensors?.rpm) && isNumeric(parsedMessage3?.outputs?.fan)) {
              newFirmware = FAN_FIRMWARE_ID;
            } else if (isNumeric(parsedMessage3?.outputs?.lights)) {
              newFirmware = LIGHT_FIRMWARE_ID;
            } else if (isNumeric(parsedMessage3?.outputs?.relais)) {
              newFirmware = PLUG_FIRMWARE_ID;
            }

            if (newFirmware) {
              break;
            }
            return;
          default:
            console.log('UNKNOWN MQTT TOPIC!', topic, String(message.message));
            return;
        }

        if (!devicesInstructed.includes(device_id)) {
          let parsedMessage2: any = { content: message.message };
          try {
            parsedMessage2 = JSON.parse(message.message);
          } catch(e) {}
          console.log(`Device ${device_id} connected with firmware ${parsedMessage2.firmware_id}`);
          newFirmware ??= ALLOWED_FIRMWARES[parsedMessage2.firmware_id];
          setTimeout(() => {
            mqttclient.publish('/devices/' + device_id + '/firmware', newFirmware);
          }, 5000);
          devicesInstructed.push(device_id);

          setTimeout(() => {
            mqttclient.publish(
              '/devices/' + device_id + '/fwupdate',
              JSON.stringify({
                version: newFirmware,
                url: `https://fg2.novazer.com/api/device/firmware/${newFirmware}/firmware.bin`,
              }),
            );
          }, 10000);

          await mailTransport.sendMail({
                  from: SMTP_SENDER,
                  to: SMTP_SENDER,
                  subject: '[FG2] Instructed device',
                  text: parsedMessage2.firmware_id + ' on device ' + device_id + `\nnew firmware: ${newFirmware}\n\n` + JSON.stringify(message.message),
                });
        }

        if (devicesInstructedTime > 0) {
          if (devicesInstructedTime + 1800000 < Date.now()) {
            devicesInstructed.splice(0, devicesInstructed.length);
            devicesInstructedTime = 0;
          }
        } else {
          devicesInstructedTime = Date.now();
        }
      });
    } catch (exception) {
      console.log(exception);
      setTimeout(() => {
        this.connectMqtt();
      }, 10000);
    }
  }

  private async checkAndUpgrade(device: Device) {
    await deviceModel.findOneAndUpdate({ device_id: device.device_id }, { lastseen: Date.now() });
    if (device.current_firmware != device.pending_firmware && device.pending_firmware && device.pending_firmware != '') {
      mqttclient.publish('/devices/' + device.device_id + '/firmware', device.pending_firmware);
    }
  }

  private async findUpgradeableDevices() {
    const classes = await deviceClassModel.find();
    for (const device_class of classes) {
      const currently_upgrading = await deviceModel
        .where({
          pending_firmware: device_class.firmware_id,
          class_id: device_class.class_id,
          current_firmware: { $ne: device_class.firmware_id },
          fwupdate_start: { $gte: Date.now() - UPGRADE_TIMEOUT },
        })
        .countDocuments();

      const failed = await deviceModel
        .where({
          pending_firmware: device_class.firmware_id,
          class_id: device_class.class_id,
          current_firmware: { $ne: device_class.firmware_id },
          fwupdate_start: { $lte: Date.now() - UPGRADE_TIMEOUT },
        })
        .countDocuments();

      if (currently_upgrading < device_class.concurrent && failed < device_class.maxfails) {
        const devices: Device[] = await deviceModel
          .find({
            lastseen: { $gte: Date.now() - ONLINE_TIMEOUT },
            class_id: device_class.class_id,
            pending_firmware: { $ne: device_class.firmware_id },
          })
          .limit(device_class.concurrent - currently_upgrading);
        for (const device of devices) {
          console.log('upgrading device ' + device.device_id);
          await deviceModel.findByIdAndUpdate(device._id, { pending_firmware: device_class.firmware_id, fwupdate_start: Date.now() });
        }
      }
      // const stuck_devices: Device[] = await deviceModel.find({
      //   lastseen: {$gte: Date.now() - ONLINE_TIMEOUT},
      //   class_id: device_class.class_id,
      //   pending_firmware: {$ne: device_class.firmware_id}
      // })
    }
  }

  private async statusMessage(device: Device, message: StatusMessage) {
    if (device.owner_id) {
      await dataService.addData(device.device_id, device.owner_id, message);
      await alarmService.onDataReceived(device.device_id, device.owner_id, message);
    }
  }

  private async fetchMessage(device: Device, payload) {
    //const device_class = await deviceClassModel.findOne({class_id: device.class_id});
    try {
      if (payload.firmware_id) {
        if (payload.firmware_id != device.current_firmware) {
          if (payload.firmware_id == device.pending_firmware) {
            await deviceModel.findByIdAndUpdate(device._id, { current_firmware: payload.firmware_id, fwupdate_end: Date.now() });
            console.log('device ' + device.device_id + 'finished update, time: ' + (Date.now() - device.fwupdate_start) / 1000 + 's');
          } else {
            await deviceModel.findByIdAndUpdate(device._id, { current_firmware: payload.firmware_id });
          }
        }
      }
    } catch (e) {}

    if (device.configuration != '') {
      mqttclient.publish('/devices/' + device.device_id + '/configuration', device.configuration);
    }
  }

  public async logMessage(deviceId: string, msg: { message: string; title?: string; severity: 0 | 1 | 2; raw?: boolean }) {
    //console.log("\nLOG\n", message)
    const log_count = await deviceLogModel.where({ device_id: deviceId }).countDocuments();
    if (log_count > 100) {
      const last_logs: any = await deviceLogModel.find({ device_id: deviceId }).sort({ time: -1 }).skip(99).limit(1);
      await deviceLogModel.deleteMany({ device_id: deviceId, time: { $lt: last_logs[0].time } });
    }
    await deviceLogModel.create({
      device_id: deviceId,
      message: msg.message,
      title: msg.title || msg.message,
      severity: msg.severity,
      raw: msg.raw,
    });
  }

  public async getDeviceLogs(device_id: string, user_id: string, is_admin: boolean) {
    let device;
    if (is_admin) {
      device = await deviceModel.findOne({ device_id: device_id }, { device_id: 1 });
    } else {
      device = await deviceModel.findOne({ device_id: device_id, owner_id: user_id }, { device_id: 1 });
    }
    if (device) {
      const logs = await deviceLogModel.find({ device_id: device_id }).sort({ time: 1 }).limit(100);
      return logs;
    }
    return [];
  }

  public async deleteDeviceLogs(device_id: string, user_id: string) {
    const device = await deviceModel.findOne({ device_id: device_id, owner_id: user_id }, { device_id: 1 });
    if (device) {
      await deviceLogModel.deleteMany({ device_id: device_id });
    }
  }

  private async settingsMessage(device: Device, message) {
    await deviceModel.findOneAndUpdate({ device_id: device.device_id }, { configuration: JSON.stringify(message) });
  }

  public async findAllDevices(): Promise<Device[]> {
    const devices: Device[] = await deviceModel.find({});
    return devices;
  }

  public async getDeviceBySerial(serialnumber: Number): Promise<Device> {
    const device: Device = await deviceModel.findOne({ serialnumber: serialnumber });
    return device;
  }

  public async findUserDevices(user_id: string): Promise<Device[]> {
    const devices: Device[] = await deviceModel.find({ owner_id: user_id }, { device_id: 1, configuration: 1, device_type: 1, name: 1 });
    // const users: Device[] = await deviceModel.aggregate([{$match: {owner_id: user_id}}, {$lookup: {from: 'deviceclasses', localField:'class_id', foreignField: 'class_id', as:'device_class'}}]);
    return devices;
  }

  public async register(info: RegisterDeviceDto): Promise<any> {
    console.log(info);

    if (!ENABLE_SELF_REGISTRATION) {
      console.log('REGISTRATION DISABLED');
      return false;
    }
    if (info.registration_password != SELF_REGISTRATION_PASSWORD) {
      console.log('WRONG PASSWORD');
      return false;
    }

    let serial = 0;

    try {
      const serialquery = await deviceModel.aggregate([
        {
          $group: {
            _id: null,
            serial: { $max: '$serialnumber' },
          },
        },
      ]);

      serial = parseInt(serialquery?.[0]?.serial) || 0;
    } catch (err) {
      console.log(err);
    }

    serial = serial + 1;

    console.log(serial);

    const device_class = await deviceClassModel.findOne({ name: info.device_type });

    console.log(device_class);

    const device: Device = {
      device_id: info.device_id,
      username: info.username,
      password: info.password,
      class_id: device_class.class_id,
      device_type: info.device_type,
      configuration: '',
      owner_id: '',
      serialnumber: serial,
      pending_firmware: device_class.firmware_id,
      current_firmware: '',
      lastseen: 0,
      fwupdate_end: 0,
      fwupdate_start: 0,
    };

    try {
      await deviceModel.deleteOne({ device_id: info.device_id, owner_id: '' }); // remove unclaimed device with same id
      await deviceModel.create(device);
    } catch (err) {
      console.log(err);
    }

    console.log(device);

    return { fw: device_class.firmware_id };
  }

  public async create(info: AddDeviceDto): Promise<Device> {
    const serialquery = await deviceModel.aggregate([
      {
        $group: {
          _id: null,
          serial: { $max: '$serialnumber' },
        },
      },
    ]);

    let serial = parseInt(serialquery?.[0]?.serial) || 0;
    serial = serial + 1;

    const device_class = await deviceClassModel.findOne({ class_id: info.class_id });

    const device: Device = {
      device_id: uuidv4(),
      username: uuidv4(),
      password: uuidv4(),
      class_id: info.class_id,
      device_type: info.device_type,
      configuration: '',
      owner_id: '',
      serialnumber: serial,
      pending_firmware: device_class.firmware_id,
      current_firmware: '',
      lastseen: 0,
      fwupdate_end: 0,
      fwupdate_start: 0,
    };

    await deviceModel.create(device);
    return device;
  }

  private genClaimCode(): string {
    const chars = [
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'K',
      'M',
      'N',
      'P',
      'R',
      'S',
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ];
    const len = 6;
    let code = '';

    for (let i = 0; i < len; i++) {
      const char = chars[Math.round(Math.random() * (chars.length - 1))];
      code += char;
    }

    return code;
  }

  public async getClaimCode(device_id: string) {
    let code = '';
    let doc = null;
    do {
      code = this.genClaimCode();
      doc = await claimCodeModel.findOne({ claim_code: code });
    } while (doc); // ensure unique code

    await claimCodeModel.findOneAndUpdate({ device_id: device_id }, { claim_code: code, device_id: device_id }, { upsert: true });

    return { claim_code: code };
  }

  public async claimDevice(claim_code: string, user_id: string) {
    const dev = await claimCodeModel.findOne({ claim_code: claim_code });
    if (dev) {
      claimCodeModel.deleteOne({ claim_code: claim_code });
      await deviceModel.findOneAndUpdate({ device_id: dev.device_id }, { owner_id: user_id });
    }
  }

  public async unClaimDevice(device_id: string) {
    await deviceModel.findOneAndUpdate({ device_id: device_id }, { owner_id: '' });
  }

  public async configureDevice(device_id: string, user_id: string, config: string) {
    await deviceModel.findOneAndUpdate({ device_id: device_id, owner_id: user_id }, { configuration: config });
    mqttclient.publish('/devices/' + device_id + '/configuration', config);
  }

  public async setDeviceAlarms(device_id: string, user_id: string, alarms: Alarm[]): Promise<void> {
    const device = await deviceModel.findOne({ device_id: device_id, owner_id: user_id });

    if (!device) {
      throw new HttpException(404, 'Device not found or access denied');
    }

    for (const alarm of alarms) {
      if (!alarm.alarmId) {
        alarm.alarmId = uuidv4();
      }
    }

    await deviceModel.updateOne({ device_id: device_id }, { alarms: alarms });
    alarmService.invalidateAlarmCache(device_id);
  }

  public async setDeviceName(device_id: string, user_id: string, name: string) {
    await deviceModel.findOneAndUpdate({ device_id: device_id, owner_id: user_id }, { name: name });
  }

  public async getDeviceConfig(device_id: string, user_id: string, is_admin: boolean) {
    if (is_admin) {
      const device = await deviceModel.findOne({ device_id: device_id }, { configuration: 1 });
      return device.configuration;
    } else {
      const device = await deviceModel.findOne({ device_id: device_id, owner_id: user_id }, { configuration: 1 });
      return device.configuration;
    }
  }

  public async getDeviceAlarms(device_id: string, user_id: string) {
    const device = await deviceModel.findOne({ device_id: device_id, owner_id: user_id }, { alarms: 1 });
    return device.alarms || [];
  }

  public async listClasses(): Promise<DeviceClass[]> {
    const classes: DeviceClass[] = await deviceClassModel.find({});
    return classes;
  }

  public async getClass(class_id: string): Promise<DeviceClass> {
    const classes: DeviceClass = await deviceClassModel.findOne({ class_id: class_id });
    return classes;
  }

  public async findClass(class_name: string): Promise<DeviceClass> {
    const classes: DeviceClass = await deviceClassModel.findOne({ name: class_name });
    return classes;
  }

  public async createClass(name: string, description: string, concurrent: number, maxfails: number, firmware_id: string): Promise<DeviceClass> {
    const device_class: DeviceClass = {
      class_id: uuidv4(),
      name: name,
      description: description,
      concurrent: concurrent,
      maxfails: maxfails,
      firmware_id: firmware_id,
    };

    await deviceClassModel.create(device_class);
    return device_class;
  }

  public async testOutputs(device_id: string, outputs: TestDeviceDto) {
    mqttclient.publish(
      '/devices/' + device_id + '/command',
      JSON.stringify({
        action: 'test',
        outputs: {
          heater: outputs.heater,
          dehumidifier: outputs.dehumidifier,
          co2: outputs.co2,
          lights: outputs.lights,
          fanint: outputs.fanint,
          fanext: outputs.fanext,
          fanbw: outputs.fanbw,
        },
      }),
    );
  }

  public async stopTest(device_id: string) {
    mqttclient.publish(
      '/devices/' + device_id + '/command',
      JSON.stringify({
        action: 'stoptest',
      }),
    );
  }

  public async updateClass(
    class_id: string,
    name: string,
    description: string,
    concurrent: number,
    maxfails: number,
    firmware_id: string,
  ): Promise<DeviceClass> {
    const update = await deviceClassModel.findOneAndUpdate(
      { class_id: class_id },
      {
        name: name,
        description: description,
        concurrent: concurrent,
        maxfails: maxfails,
        firmware_id: firmware_id,
      },
    );

    if (update) {
      if (update.firmware_id != firmware_id) {
        const devices = await deviceModel.find({ class_id: class_id });
        for (const device of devices) {
          mqttclient.publish('/devices/' + device.device_id + '/firmware', firmware_id);
        }
      }
      return update;
    } else {
      throw new HttpException(404, 'Class not found');
    }
  }

  public async createFirmware(classname: string, version: string): Promise<DeviceFirmware> {
    const deviceclass = await deviceClassModel.findOne({ name: classname });
    return await deviceFirmwareModel.create({
      firmware_id: uuidv4(),
      class_id: deviceclass.class_id,
      version: version,
    });
  }

  public async createFirmwareBinary(fw_id: string, name: string, data: Buffer): Promise<DeviceFirmwareBinary> {
    return await deviceFirmwareBinaryModel.create({
      firmware_id: fw_id,
      name: name,
      data: data,
    });
  }

  public async findFirmwareByNameVersion(name: string, version: string): Promise<DeviceFirmware> {
    const firmware: DeviceFirmware = await deviceFirmwareModel.findOne(
      {
        name: name,
        version: version,
      },
      { _id: 0, firmware_id: 1, name: 1, version: 1 },
    );
    return firmware;
  }

  public async findAllFirmware(): Promise<DeviceFirmware[]> {
    const firmwares: DeviceFirmware[] = await deviceFirmwareModel.find({}, { _id: 0, firmware_id: 1, name: 1, version: 1 });
    return firmwares;
  }

  public async getFirmwareBinary(firmware_id: string, binary_name: string): Promise<Buffer> {
    const binary: DeviceFirmwareBinary = await deviceFirmwareBinaryModel.findOne({ firmware_id: firmware_id, name: binary_name }, { data: 1 });
    return binary.data;
  }

  public async findOnlineDevices(): Promise<any> {
    const classes: DeviceClass[] = await deviceClassModel.find({});

    const class_count = await Promise.all(
      classes.map(async deviceclass => {
        return {
          class: deviceclass,
          online: await deviceModel.where({ lastseen: { $gte: Date.now() - ONLINE_TIMEOUT }, class_id: deviceclass.class_id }).countDocuments(),
          total: await deviceModel.where({ class_id: deviceclass.class_id }).countDocuments(),
        };
      }),
    );

    return class_count;
  }

  public async getFirmwareVersions(): Promise<any> {
    const classes: DeviceClass[] = await deviceClassModel.find({});

    const upgradetimes = await deviceModel.aggregate([
      {
        $match: {
          fwupdate_end: { $type: 'number' },
        },
      },
      {
        $group: {
          _id: '$current_firmware',
          avgTime: { $avg: { $subtract: ['$fwupdate_end', '$fwupdate_start'] } },
          maxTime: { $max: { $subtract: ['$fwupdate_end', '$fwupdate_start'] } },
        },
      },
    ]);

    const class_count = await Promise.all(
      classes.map(async deviceclass => {
        const fwversions: DeviceFirmware[] = await deviceFirmwareModel.find({ class_id: deviceclass.class_id });
        const fwids = fwversions.map(fw => fw.firmware_id);

        const versions = await Promise.all(
          fwversions.map(async fwversion => {
            const upgrade_time = upgradetimes.find(el => el._id == fwversion.firmware_id);
            return {
              fw: fwversion,
              online: await deviceModel
                .where({
                  lastseen: { $gte: Date.now() - ONLINE_TIMEOUT },
                  class_id: deviceclass.class_id,
                  current_firmware: fwversion.firmware_id,
                })
                .countDocuments(),
              total: await deviceModel
                .where({
                  current_firmware: fwversion.firmware_id,
                  class_id: deviceclass.class_id,
                })
                .countDocuments(),
              updating: await deviceModel
                .where({
                  fwupdate_start: { $gte: Date.now() - UPGRADE_TIMEOUT },
                  current_firmware: { $ne: fwversion.firmware_id },
                  class_id: deviceclass.class_id,
                  pending_firmware: fwversion.firmware_id,
                })
                .countDocuments(),
              failed: await deviceModel
                .where({
                  fwupdate_start: { $lte: Date.now() - UPGRADE_TIMEOUT },
                  current_firmware: { $ne: fwversion.firmware_id },
                  class_id: deviceclass.class_id,
                  pending_firmware: fwversion.firmware_id,
                })
                .countDocuments(),
              avgtime: upgrade_time?.avgTime || 0,
              maxtime: upgrade_time?.maxTime || 0,
            };
          }),
        );

        versions.push({
          fw: {
            firmware_id: null,
            name: 'unknown',
            version: '0',
            class_id: deviceclass.class_id,
          },
          online: await deviceModel
            .where({ lastseen: { $gte: Date.now() - ONLINE_TIMEOUT }, class_id: deviceclass.class_id, current_firmware: { $nin: fwids } })
            .countDocuments(),
          total: await deviceModel.where({ current_firmware: { $not: { $in: fwids } }, class_id: deviceclass.class_id }).countDocuments(),
          updating: 0,
          failed: 0,
          avgtime: 0,
          maxtime: 0,
        });

        return {
          class: deviceclass,
          versions: versions,
        };
      }),
    );

    return class_count;
  }
}

export const deviceService = new DeviceService();
