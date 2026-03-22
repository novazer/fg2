import { NextFunction, Request, Response } from 'express';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { isUserDeviceMiddelware } from '@/middlewares/auth.middleware';
import { imageService } from '@services/image.service';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

function parseResizeDimension(value: unknown, max = 4096): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const normalized = Math.floor(parsed);
  if (normalized <= 0) {
    return undefined;
  }

  return Math.min(normalized, max);
}

class ImageController {
  public getDeviceImage = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      if (await isUserDeviceMiddelware(req, res, req.params.device_id, 'image')) {
        const image = await imageService.getDeviceImage(
          req.params.device_id,
          String(req.query.format),
          Number(req.query.timestamp),
          String(req.query.duration || ''),
          String(req.query.image_id ?? ''),
        );

        if (image) {
          this.sendImage(req, res, image.data, image.format === 'mp4' ? 'video/mp4' : 'image/jpeg');
        } else {
          if (req.query.format === 'mp4') {
            this.sendImage(req, res, await readFile('assets/no-image_placeholder.mp4'), 'video/mp4');
          } else {
            this.sendImage(req, res, await readFile('assets/no-image_placeholder.png'), 'image/png');
          }
        }
      } else {
        res.status(401).send();
      }
    } catch (error) {
      next(error);
    }
  };

  public uploadDeviceImage = async (req: any, res: Response, next: NextFunction) => {
    try {
      if (!(await isUserDeviceMiddelware(req, res, req.params.device_id, 'user'))) {
        return;
      }

      const files = req.files as Record<string, any> | undefined;
      const uploaded = files?.image;
      const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

      if (!file?.data || !Buffer.isBuffer(file.data)) {
        res.status(400).json({ message: 'Image file is missing or invalid' });
        return;
      }

      const timestamp = Number(req.body?.timestamp);
      const image = await imageService.createDeviceImage(req.params.device_id, file.data, Number.isFinite(timestamp) ? timestamp : undefined);

      res.status(201).json({
        image_id: image.image_id,
        device_id: image.device_id,
        timestamp: image.timestamp,
        format: image.format,
      });
    } catch (error) {
      next(error);
    }
  };

  public deleteImage = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const image = await imageService.getImageById(req.params.image_id);
      if (!image) {
        res.status(404).json({ status: 'not found' });
        return;
      }

      if (!(await isUserDeviceMiddelware(req, res, image.device_id, 'user'))) {
        return;
      }

      const deleted = await imageService.deleteImage(req.params.image_id);
      if (!deleted) {
        res.status(404).json({ status: 'not found' });
        return;
      }

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  };

  private sendImage(req: Request, res: Response, image: Buffer, contentType: string) {
    const width = parseResizeDimension(req.query.width);
    const height = parseResizeDimension(req.query.height);

    if (contentType.startsWith('image/') && (width || height)) {
      void sharp(image)
        .rotate()
        .resize({
          width,
          height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg()
        .toBuffer()
        .then(resizedBuffer => {
          res.setHeader('Content-type', 'image/jpeg');
          res.setHeader('Cache-Control', 'max-age=3600');
          res.send(resizedBuffer);
        })
        .catch(async e => {
          console.log('Failed resizing image:', e);
          res.status(500).send(await readFile('assets/no-image_placeholder.png'));
        });
    } else {
      res.setHeader('Content-type', contentType);
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(image);
    }
  }
}

export default ImageController;
