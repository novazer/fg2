import { NextFunction, Response } from 'express';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { isUserDeviceMiddelware } from '@/middlewares/auth.middleware';
import { readFileSync } from 'fs';
import { imageService } from '@services/image.service'; // new import

class ImageController {
  public getDeviceImage = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id)) {
        const image = await imageService.getDeviceImage(
          req.params.device_id,
          String(req.query.format),
          Number(req.query.timestamp),
          String(req.query.duration || ''),
        );

        if (image) {
          res.setHeader('Content-type', image.format === 'mp4' ? 'video/mp4' : 'image/jpeg');
          res.setHeader('Cache-Control', 'max-age=3600');
          res.send(image.data);
        } else {
          res.setHeader('Cache-Control', 'no-cache');
          if (req.query.format === 'mp4') {
            res.setHeader('Content-type', 'video/mp4');
            res.status(200).send(readFileSync('assets/no-image_placeholder.mp4'));
          } else {
            res.setHeader('Content-type', 'image/png');
            res.status(200).send(readFileSync('assets/no-image_placeholder.png'));
          }
        }
      } else {
        res.status(401).send();
      }
    } catch (error) {
      next(error);
    }
  };
}

export default ImageController;
