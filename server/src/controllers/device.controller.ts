import { NextFunction, Request, Response } from 'express';
import { Device, Recipe } from '@interfaces/device.interface';
import { deviceService } from '@services/device.service';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { AddDeviceClassDto, TestDeviceDto } from '@dtos/device.dto';
import { isUserDeviceMiddelware } from '@/middlewares/auth.middleware';
import deviceModel from '@models/device.model'; // added import
import recipeModel from '@models/recipe.model';

class DeviceController {
  public getDevices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices: Device[] = await deviceService.findAllDevices();

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.create(req.body);
      res.status(201).json(device);
    } catch (error) {
      next(error);
    }
  };

  public register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.register(req.body);
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
      const devices: Device[] = await deviceService.findUserDevices(req.user_id);

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  public getDeviceBySerial = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (req.is_admin) {
        const device: Device = await deviceService.getDeviceBySerial(parseInt(req.query.serialnumber as string));

        res.status(200).json(device);
      } else {
        res.status(401);
      }
    } catch (error) {
      next(error);
    }
  };

  public activateMaintenanceMode = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (req.is_admin || (await isUserDeviceMiddelware(req, res, req.body.device_id))) {
        const durationMinutes = req.body.duration_minutes || 0;
        await deviceService.activateMaintenanceMode(req.body.device_id, durationMinutes);
        res.status(200).json({ status: 'ok' });
      } else {
        res.status(401);
      }
    } catch (error) {
      next(error);
    }
  };

  public getClaimCode = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const code = await deviceService.getClaimCode(req.body.device_id);
      res.status(200).json(code);
    } catch (error) {
      next(error);
    }
  };

  public claimDevice = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const success = await deviceService.claimDevice(req.body.claim_code, req.user_id);

      if (!success) {
        return res.status(400).json({ status: 'invalid claim code or device not found' });
      }

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  public unClaimDevice = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id)) {
        await deviceService.unClaimDevice(req.params.device_id);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public configureDevice = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const deviceId = req.params.device_id ?? req.body.device_id;
      if (await isUserDeviceMiddelware(req, res, deviceId)) {
        await deviceService.configureDevice(deviceId, req.user_id, req.body.configuration);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public setDeviceAlarms = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.body.device_id)) {
        await deviceService.setDeviceAlarms(req.body.device_id, req.user_id, req.body.alarms);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public setDeviceCloudSettings = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.body.device_id)) {
        await deviceService.setDeviceCloudSettings(req.body.device_id, req.user_id, req.body.cloud_settings);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public setDeviceName = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.body.device_id)) {
        await deviceService.setDeviceName(req.body.device_id, req.user_id, req.body.name);
        res.status(200).json({ status: 'ok' });
      }
    } catch (error) {
      next(error);
    }
  };

  public getDeviceConfig = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const config = await deviceService.getDeviceConfig(req.params.device_id, req.user_id, req.is_admin);
        res.status(200).json(config);
      }
    } catch (error) {
      next(error);
    }
  };

  public getDeviceAlarms = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const alarms = await deviceService.getDeviceAlarms(req.params.device_id, req.user_id);
        res.status(200).json(alarms);
      }
    } catch (error) {
      next(error);
    }
  };

  public getDeviceCloudSettings = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const settings = await deviceService.getDeviceCloudSettings(req.params.device_id);
        res.status(200).json(settings);
      }
    } catch (error) {
      next(error);
    }
  };

  public testMode = async (req: any, res: Response, next: NextFunction) => {
    const outputs: TestDeviceDto = req.body;
    await deviceService.testOutputs(req.params.device_id, outputs);
  };

  public stopTest = async (req: any, res: Response, next: NextFunction) => {
    await deviceService.stopTest(req.params.device_id);
  };

  public createClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const class_info: AddDeviceClassDto = req.body;
      await deviceService.createClass(class_info.name, class_info.description, class_info.concurrent, class_info.maxfails, class_info.firmware_id);
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public updateClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const class_info: AddDeviceClassDto = req.body;
      await deviceService.updateClass(
        req.params.class_id,
        class_info.name,
        class_info.description,
        class_info.concurrent,
        class_info.maxfails,
        class_info.firmware_id,
        class_info.beta_firmware_id,
      );
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public listClasses = async (req: any, res: Response, next: NextFunction) => {
    try {
      const classes = await deviceService.listClasses();
      res.status(200).json(classes);
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public getClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const classes = await deviceService.getClass(req.params.class_id);
      res.status(200).json(classes);
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public findClass = async (req: any, res: Response, next: NextFunction) => {
    try {
      const classes = await deviceService.findClass(req.params.class_name);
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
      const fw = await deviceService.createFirmware(req.body.name, req.body.version);

      res.status(200).json({ firmware_id: fw.firmware_id, name: fw.name, version: fw.version });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public createFirmwareBinary = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await deviceService.createFirmwareBinary(req.params.firmware_id, req.params.binary, req.files.binary.data);

      res.status(200).json({ firmware_id: fw.firmware_id, name: fw.name });
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public listFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await deviceService.findAllFirmware();
      res.status(200).json(fw);
    } catch (error) {
      next(error);
    }
  };

  public findFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      const fw = await deviceService.findFirmwareByNameVersion(req.query.name, req.query.version);
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
      const fw: Buffer = await deviceService.getFirmwareBinary(req.params.firmware_id, req.params.binary);
      res.setHeader('Content-disposition', 'attachment; filename=firmware.bin');
      res.setHeader('Content-type', 'application/octet-stream');
      res.send(fw);
    } catch (error) {
      next(error);
    }
  };

  public deleteFirmware = async (req: any, res: Response, next: NextFunction) => {
    try {
      await deviceService.deleteFirmware(req.params.firmware_id);
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  public getDeviceLogs = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const logs = await deviceService.getDeviceLogs(
          req.params.device_id,
          req.user_id,
          req.is_admin,
          Number(req.query.from ?? 0),
          Number(req.query.to ?? Date.now()),
          Boolean(req.query.deleted ?? false),
        );
        res.status(200).json(logs);
      }
    } catch (error) {
      next(error);
    }
  };

  public deleteDeviceLogs = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await deviceService.deleteDeviceLogs(req.params.device_id, req.user_id);

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  public getOnlineDevices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices: Device[] = await deviceService.findOnlineDevices();

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  public getFirmwareVersions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const devices: any = await deviceService.getFirmwareVersions();

      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  };

  // GET /device/recipe/:device_id
  public getRecipe = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const device_id = req.params.device_id;
      if (!device_id) {
        return res.status(400).json({ error: 'Missing device_id' });
      }

      if (await isUserDeviceMiddelware(req, res, device_id)) {
        const doc = await deviceModel.findOne({ device_id }).select('recipe').lean().exec();
        const defaultRecipe = { steps: [], activeStepIndex: 0, activeSince: 0 };
        const recipeObj = doc && doc.recipe ? doc.recipe : defaultRecipe;
        res.status(200).json(recipeObj);
      }
    } catch (error) {
      next(error);
    }
  };

  // POST /device/recipe
  // Body: { device_id: string, recipe: object }
  public setRecipe = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const device_id = req.body.device_id;
      const recipePayload = req.body.recipe;

      if (!device_id) {
        return res.status(400).json({ error: 'Missing device_id' });
      }

      if (recipePayload === undefined || recipePayload === null) {
        return res.status(400).json({ error: 'Missing recipe payload' });
      }

      if (!(await isUserDeviceMiddelware(req, res, device_id))) {
        return; // middleware already handled response if unauthorized
      }

      const oldRecipe = (await deviceModel.findOne({ device_id }).select('recipe'))?.recipe ?? ({} as Recipe);
      const activeStepChanged =
        oldRecipe?.activeStepIndex !== recipePayload?.activeStepIndex || oldRecipe?.activeSince !== recipePayload?.activeSince;

      for (let i = 0; i < (recipePayload.steps?.length || 0); i++) {
        if (i !== recipePayload.activeStepIndex || activeStepChanged) {
          recipePayload.steps[i].notified = false;
        }
        recipePayload.steps[i].lastTimeApplied = 0;
      }

      if (
        activeStepChanged &&
        recipePayload?.activeStepIndex !== undefined &&
        recipePayload?.activeStepIndex !== null &&
        !isNaN(recipePayload.activeStepIndex) &&
        recipePayload?.additionalInfo
      ) {
        await deviceService.logMessage(device_id, {
          title: `Recipe step #${recipePayload.activeStepIndex + 1} manually activated`,
          message: `Recipe step #${recipePayload.activeStepIndex + 1} (${
            recipePayload.steps?.[recipePayload.activeStepIndex]?.name ?? ''
          }) has been manually activated by the user.`,
          raw: true,
          severity: 0,
          categories: ['recipe'],
        });
      }

      const updated = await deviceModel.findOneAndUpdate({ device_id }, { $set: { recipe: recipePayload } }, { new: true, useFindAndModify: false });

      if (!updated) {
        return res.status(404).json({ error: 'Device not found' });
      }

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  // List templates: returns public templates + templates owned by user
  public listRecipes = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user_id;
      const recipes = await recipeModel
        .find({ $or: [{ public: true }, { owner_id: userId }] })
        .lean()
        .exec();
      res.status(200).json(recipes);
    } catch (error) {
      next(error);
    }
  };

  // Create a new template
  public createRecipeTemplate = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { name, steps, public: isPublic } = req.body;
      if (!name || !steps) {
        return res.status(400).json({ error: 'Missing name or steps' });
      }
      // unique by name
      const exists = await recipeModel.findOne({ name }).lean().exec();
      if (exists) {
        return res.status(409).json({ error: 'Template name already exists' });
      }
      const doc = await recipeModel.create({
        name,
        owner_id: req.user_id,
        public: !!isPublic,
        steps,
      });
      res.status(201).json(doc);
    } catch (error) {
      next(error);
    }
  };

  // Get single template
  public getRecipeTemplate = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = req.params.template_id;
      const doc = await recipeModel.findById(id).lean().exec();
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      // allow if public or owner or admin
      if (!doc.public && doc.owner_id !== req.user_id && !req.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      res.status(200).json(doc);
    } catch (error) {
      next(error);
    }
  };

  // Update template
  public updateRecipeTemplate = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = req.params.template_id;
      const { name, steps, public: isPublic } = req.body;
      const doc = await recipeModel.findById(id).exec();
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (doc.owner_id !== req.user_id && !req.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      // if changing name, ensure unique
      if (name && name !== doc.name) {
        const exists = await recipeModel
          .findOne({ name, _id: { $ne: id } })
          .lean()
          .exec();
        if (exists) {
          return res.status(409).json({ error: 'Template name already exists' });
        }
        doc.name = name;
      }
      if (steps && Array.isArray(steps)) doc.steps = steps;
      if (typeof isPublic !== 'undefined') doc.public = !!isPublic;
      await doc.save();
      res.status(200).json(doc);
    } catch (error) {
      next(error);
    }
  };

  // Delete template
  public deleteRecipeTemplate = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = req.params.template_id;
      const doc = await recipeModel.findById(id).exec();
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (doc.owner_id !== req.user_id && !req.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await recipeModel.findByIdAndDelete(id).exec();
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };
}

export default DeviceController;
