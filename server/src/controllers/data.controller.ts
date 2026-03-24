import { NextFunction, Request, Response } from 'express';
import { dataService } from '@services/data.service';
import { isUserDeviceOrPublicReadMiddelware } from '@/middlewares/auth.middleware';
import { RequestWithUser } from '@/interfaces/auth.interface';

class DataController {
  public getSeries = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceOrPublicReadMiddelware(req, res, req.params.device_id)) {
        const data = await dataService.getSeries(
          req.params.device_id,
          req.params.measure,
          req.query?.from,
          req.query?.to,
          req.query?.interval,
          String(req.query?.method),
        );
        res.status(201).json(data);
      }
    } catch (error) {
      console.log(error);
      next(error);
    }
  };

  public getLatest = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceOrPublicReadMiddelware(req, res, req.params.device_id)) {
        const data = await dataService.getLatest(req.params.device_id, req.params.measure);
        res.status(201).json({ value: data });
      }
    } catch (error) {
      console.log(error);
      next(error);
    }
  };
}

export default DataController;
