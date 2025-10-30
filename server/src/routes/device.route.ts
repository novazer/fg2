import { Router } from 'express';
import DeviceController from '@controllers/device.controller';
import { Routes } from '@interfaces/routes.interface';
import validationMiddleware from '@/middlewares/validation.middleware';
import {
  AddDeviceDto,
  ClaimDeviceDto,
  ConfigureDeviceDto,
  AddDeviceFirmwareDto,
  AddDeviceClassDto,
  TestDeviceDto,
  SetNameDto,
  RegisterDeviceDto,
} from '@dtos/device.dto';
import { authMiddleware, authAdminMiddleware } from '@/middlewares/auth.middleware';

class DeviceRoute implements Routes {
  public path = '/device';
  public router = Router();
  public deviceController = new DeviceController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/all`, authAdminMiddleware, this.deviceController.getDevices);
    this.router.post(`${this.path}/create`, authAdminMiddleware, validationMiddleware(AddDeviceDto, 'body'), this.deviceController.create);

    this.router.post(`${this.path}/register`, validationMiddleware(RegisterDeviceDto, 'body'), this.deviceController.register);

    /**
     * @api {get} /device get user devices
     * @apiName get devices
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiSuccess {Array} list of devices paired to user account
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     [
     *        {
     *            "device_id":"4c4db402-089a-467d-87e5-d24841e1d7bd",
     *            "device_type":"fan",
     *            "configuration":"{\"mode\":2,\"day\":{\"humidity\":40,\"temperature\":23,\"max_speed\":65,\"fixed_speed\":38},\"night\":{\"humidity\":40,\"temperature\":23,\"max_speed\":65,\"fixed_speed\":37},\"min_speed\":0,\"mode_str\":\"2\",\"co2inject\":{}}",
     *            "name":"Plantalytix Fan Zelt"
     *        }
     *    ]
     *
     */
    this.router.get(`${this.path}`, authMiddleware, this.deviceController.getUserDevices);

    /**
     * @api {post} /device claim device
     * @apiName claim device
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiBody {String} claim_code device code (displayed on device screen)
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "status": "ok"
     *     }
     *
     */
    this.router.post(`${this.path}`, authMiddleware, validationMiddleware(ClaimDeviceDto, 'body'), this.deviceController.claimDevice);

    /**
     * @api {delete} /device/:device_id remove device from user account
     * @apiName unclaim device
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiParam {String} device_id device uuid
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "status": "ok"
     *     }
     *
     */
    this.router.delete(`${this.path}/:device_id`, authMiddleware, this.deviceController.unClaimDevice);

    /**
     * @api {post} /device/configure set device configuration
     * @apiName configure device
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiBody {String} [device_id] device uuid
     * @apiBody {String} [configuration] device configuration (json string)
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "status": "ok"
     *     }
     *
     */
    this.router.post(
      `${this.path}/configure`,
      authMiddleware,
      validationMiddleware(ConfigureDeviceDto, 'body'),
      this.deviceController.configureDevice,
    );

    /**
     * @api {post} /device/setname set device name
     * @apiName name device
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiBody {String} [device_id] device uuid
     * @apiBody {String} [name] device name
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "status": "ok"
     *     }
     *
     */
    this.router.post(`${this.path}/setname`, authMiddleware, validationMiddleware(SetNameDto, 'body'), this.deviceController.setDeviceName);

    /**
     * @api {get} /device/config/:device_id get current device configuration
     * @apiName get device configuration
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiParam {String} [device_id] device uuid
     *
     * @apiSuccess current device configuration (json)
     *
     */
    this.router.get(`${this.path}/config/:device_id`, authMiddleware, this.deviceController.getDeviceConfig);

    this.router.post(`${this.path}/claimcode`, this.deviceController.getClaimCode);
    this.router.post(`/auth/v0.0.1/device/claimcode`, this.deviceController.getClaimCode);
    this.router.get(`${this.path}/firmware`, authAdminMiddleware, this.deviceController.listFirmware);
    this.router.get(`${this.path}/firmware/find`, authAdminMiddleware, this.deviceController.findFirmware);
    this.router.get(`${this.path}/firmware/:firmware_id/:binary`, this.deviceController.getFirmware);
    this.router.get(`/auth/v0.0.1/device/firmware/:firmware_id/:binary`, this.deviceController.getFirmware);
    this.router.post(`${this.path}/firmware/:firmware_id/:binary`, authAdminMiddleware, this.deviceController.createFirmwareBinary);
    this.router.post(
      `${this.path}/firmware`,
      authAdminMiddleware,
      validationMiddleware(AddDeviceFirmwareDto, 'body'),
      this.deviceController.createFirmware,
    );
    this.router.get(`${this.path}/class`, authAdminMiddleware, this.deviceController.listClasses);
    this.router.get(`${this.path}/class/find/:class_name`, authAdminMiddleware, this.deviceController.findClass);
    this.router.get(`${this.path}/class/:class_id`, authAdminMiddleware, this.deviceController.getClass);
    this.router.post(`${this.path}/class`, authAdminMiddleware, validationMiddleware(AddDeviceClassDto, 'body'), this.deviceController.createClass);
    this.router.post(
      `${this.path}/class/:class_id`,
      authAdminMiddleware,
      validationMiddleware(AddDeviceClassDto, 'body'),
      this.deviceController.updateClass,
    );
    this.router.post(`${this.path}/test/:device_id`, authMiddleware, validationMiddleware(TestDeviceDto, 'body'), this.deviceController.testMode);
    this.router.delete(`${this.path}/test/:device_id`, authMiddleware, this.deviceController.stopTest);

    /**
     * @api {get} /device/logs/:device_id get device logs
     * @apiName get device logs
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiParam {String} [device_id] device uuid
     *
     * @apiSuccess array of device log entries
     *
     */
    this.router.get(`${this.path}/logs/:device_id`, authMiddleware, this.deviceController.getDeviceLogs);

    /**
     * @api {delete} /device/logs/:device_id clear device logs
     * @apiName clear device logs
     * @apiGroup device
     *
     * @apiUse authentication
     *
     * @apiParam {String} [device_id] device uuid
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "status": "ok"
     *     }
     *
     */
    this.router.delete(`${this.path}/logs/:device_id`, authMiddleware, this.deviceController.deleteDeviceLogs);
    this.router.get(`${this.path}/byserial`, authAdminMiddleware, this.deviceController.getDeviceBySerial);

    this.router.get(`${this.path}/onlinedevices`, authAdminMiddleware, this.deviceController.getOnlineDevices);
    this.router.get(`${this.path}/firmwareversions`, authAdminMiddleware, this.deviceController.getFirmwareVersions);
  }
}

export default DeviceRoute;
