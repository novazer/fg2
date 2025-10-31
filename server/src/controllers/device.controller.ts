import { NextFunction, Request, Response } from 'express';
import { Device, DeviceClass, DeviceFirmware } from '@interfaces/device.interface';
import DeviceService from '@services/device.service';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { AddDeviceClassDto, TestDeviceDto } from '@dtos/device.dto';
import { isUserDeviceMiddelware } from '@/middlewares/auth.middleware';
import { version } from 'os';

class DeviceController {
  public deviceService = new DeviceService();

  public getDevices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices: Device[] = await this.deviceService.findAllDevices();

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await this.deviceService.create(req.body);
      res.status(201).json(device);
    } catch (error) {
      next(error);
    }
  };

  public register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await this.deviceService.register(req.body);
      if (device === false) {
        res.status(401);
      } else {
        res.status(201).json(device);
      }
    } catch (error) {
      next(error);
    }
  };

  public getUserDevices = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const devices: Device[] = await this.deviceService.findUserDevices(req.user_id);

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  public getDeviceBySerial = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (req.is_admin) {
        const device: Device = await this.deviceService.getDeviceBySerial(parseInt(req.query.serialnumber as string));

        res.status(200).json(device);
      } else {
        res.status(401);
      }
    } catch (error) {
      next(error);
    }
  };

  public getClaimCode = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const code = await this.deviceService.getClaimCode(req.body.device_id);
      res.status(200).json(code);
    } catch (error) {
      next(error);
    }
  };

  public claimDevice = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await this.deviceService.claimDevice(req.body.claim_code, req.user_id);

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  public unClaimDevice = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.params.device_id)) {
        await this.deviceService.unClaimDevice(req.params.device_id);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public configureDevice = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.params.device_id)) {
        await this.deviceService.configureDevice(req.body.device_id, req.user_id, req.body.configuration);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public setDeviceAlarms = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.body.device_id)) {
        await this.deviceService.setDeviceAlarms(req.body.device_id, req.user_id, req.body.alarms);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public setDeviceName = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.params.device_id)) {
        await this.deviceService.setDeviceName(req.body.device_id, req.user_id, req.body.name);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public getDeviceConfig = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const config = await this.deviceService.getDeviceConfig(req.params.device_id, req.user_id, req.is_admin);
        res.status(200).json(config);
      }
    } catch (error) {
      next(error);
    }
  };

  public getDeviceAlarms = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const alarms = await this.deviceService.getDeviceAlarms(req.params.device_id, req.user_id);
        res.status(200).json(alarms);
      }
    } catch (error) {
      next(error);
    }
  }

  public testMode = async (req: any, res: Response, next: NextFunction) => {
    const outputs: TestDeviceDto = req.body;
    await this.deviceService.testOutputs(req.params.device_id, outputs);
  };

  public stopTest = async (req: any, res: Response, next: NextFunction) => {
    await this.deviceService.stopTest(req.params.device_id);
  };

  public createClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const class_info: AddDeviceClassDto = req.body;
      await this.deviceService.createClass(
        class_info.name,
        class_info.description,
        class_info.concurrent,
        class_info.maxfails,
        class_info.firmware_id,
      );
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public updateClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const class_info: AddDeviceClassDto = req.body;
      await this.deviceService.updateClass(
        req.params.class_id,
        class_info.name,
        class_info.description,
        class_info.concurrent,
        class_info.maxfails,
        class_info.firmware_id,
      );
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public listClasses = async (req: any, res: Response, next: NextFunction) => {
    try {
      const classes = await this.deviceService.listClasses();
      res.status(200).json(classes);
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public getClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const classes = await this.deviceService.getClass(req.params.class_id);
      res.status(200).json(classes);
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public findClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const classes = await this.deviceService.findClass(req.params.class_name);
      if (classes) {
        res.status(200).json(classes);
      } else {
        res.status(404).json({ status: 'not found' });
      }
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public createFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await this.deviceService.createFirmware(req.body.name, req.body.version);

      res.status(200).json({ firmware_id: fw.firmware_id, name: fw.name, version: fw.version });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public createFirmwareBinary = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await this.deviceService.createFirmwareBinary(req.params.firmware_id, req.params.binary, req.files.binary.data);

      res.status(200).json({ firmware_id: fw.firmware_id, name: fw.name });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public listFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await this.deviceService.findAllFirmware();
      res.status(200).json(fw);
    } catch (error) {
      next(error);
    }
  };

  public findFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await this.deviceService.findFirmwareByNameVersion(req.query.name, req.query.version);
      if (fw) {
        res.status(200).json(fw);
      } else {
        res.status(404).json({ status: 'not found' });
      }
    } catch (error) {
      next(error);
    }
  };

  public getFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw: Buffer = await this.deviceService.getFirmwareBinary(req.params.firmware_id, req.params.binary);
      res.setHeader('Content-disposition', 'attachment; filename=firmware.bin');
      res.setHeader('Content-type', 'application/octet-stream');
      res.send(fw);
    } catch (error) {
      next(error);
    }
  };

  public getDeviceLogs = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const logs = await this.deviceService.getDeviceLogs(req.params.device_id, req.user_id, req.is_admin);
        res.status(200).json(logs);
      }
    } catch (error) {
      next(error);
    }
  };

  public deleteDeviceLogs = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await this.deviceService.deleteDeviceLogs(req.params.device_id, req.user_id);

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  public getOnlineDevices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices: Device[] = await this.deviceService.findOnlineDevices();

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  public getFirmwareVersions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices: any = await this.deviceService.getFirmwareVersions();

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };
}

export default DeviceController;
