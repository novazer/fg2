import { NextFunction, Response } from 'express';
import { verify } from 'jsonwebtoken';
import { SECRET_KEY } from '@config';
import { HttpException } from '@exceptions/HttpException';
import { DataStoredInToken, RequestWithUser } from '@interfaces/auth.interface';
import deviceModel from '@/models/device.model';
import { Device } from '@/interfaces/device.interface';

export const authMiddleware = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const Authorization = req.cookies['Authorization'] || (req.header('Authorization') ? req.header('Authorization').split('Bearer ')[1] : null);

    if (Authorization) {
      const secretKey: string = SECRET_KEY;
      const verificationResponse = (await verify(Authorization, secretKey)) as DataStoredInToken;
      if (verificationResponse.user_id) {
        req.user_id = verificationResponse.user_id;
        req.is_admin = verificationResponse.is_admin;
        next();
      } else {
        next(new HttpException(401, 'Wrong authentication token'));
      }
    } else {
      next(new HttpException(404, 'Authentication token missing'));
    }
  } catch (error) {
    next(new HttpException(401, 'Wrong authentication token'));
  }
};

export const authAdminMiddleware = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const Authorization = req.cookies['Authorization'] || (req.header('Authorization') ? req.header('Authorization').split('Bearer ')[1] : null);

    if (Authorization) {
      const secretKey: string = SECRET_KEY;
      const verificationResponse = (await verify(Authorization, secretKey)) as DataStoredInToken;

      if (verificationResponse.is_admin) {
        req.user_id = verificationResponse.user_id;
        req.is_admin = verificationResponse.is_admin;
        next();
      } else {
        next(new HttpException(401, 'Wrong authentication token'));
      }
    } else {
      next(new HttpException(404, 'Authentication token missing'));
    }
  } catch (error) {
    console.log(error);
    next(new HttpException(401, 'Wrong authentication token'));
  }
};

export const isUserDeviceMiddelware = async (req: RequestWithUser, res: Response, device_id: string) => {
  try {
    const Authorization = req.cookies['Authorization'] || (req.header('Authorization') ? req.header('Authorization').split('Bearer ')[1] : null);

    if (Authorization) {
      const secretKey: string = SECRET_KEY;
      const verificationResponse = (await verify(Authorization, secretKey)) as DataStoredInToken;
      if (verificationResponse.user_id) {
        req.user_id = verificationResponse.user_id;
        req.is_admin = verificationResponse.is_admin;
        if (req.is_admin) {
          return true;
        }
        const devices: Device[] = await deviceModel.find({ owner_id: req.user_id, device_id: device_id }, { device_id: 1 });
        if (devices.length > 0) {
          return true;
        }

        res.status(401).send('Device not bound to user');
        return false;
      } else {
        res.status(401).send('Wrong authentication token');
        return false;
      }
    } else {
      res.status(401).send('Authentication token missing');
      return false;
    }
  } catch (error) {
    res.status(401).send('Wrong authentication token');
    return false;
  }
};
