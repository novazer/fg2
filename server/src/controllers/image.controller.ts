import { NextFunction, Request, Response } from 'express';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { isUserDeviceMiddelware } from '@/middlewares/auth.middleware';
import { imageService } from '@services/image.service';
import { readFile, unlink } from 'node:fs/promises'; // new import
import im from 'imagemagick';
import { readFileSync } from 'fs';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

function arrayBufferToString(buffer) {
  return binaryToString(String.fromCharCode.apply(null, Array.prototype.slice.apply(new Uint8Array(buffer))));
}

function binaryToString(binary) {
  let error;

  try {
    return decodeURIComponent(escape(binary));
  } catch (_error) {
    error = _error;
    if (error instanceof URIError) {
      return binary;
    } else {
      throw error;
    }
  }
}

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
          this.sendImage(req, res, image.data, image.format === 'mp4' ? 'video/mp4' : 'image/jpeg');
        } else {
          if (req.query.format === 'mp4') {
            this.sendImage(req, res, readFileSync('assets/no-image_placeholder.mp4'), 'video/mp4');
          } else {
            this.sendImage(req, res, readFileSync('assets/no-image_placeholder.png'), 'image/png');
          }
        }
      } else {
        res.status(401).send();
      }
    } catch (error) {
      next(error);
    }
  };

  private sendImage(req: Request, res: Response, image: Buffer, contentType: string) {
    if (contentType.startsWith('image/') && (req.query.width || req.query.height)) {
      const tmpFile = join(tmpdir(), Date.now() + '-' + uuidv4() + '.jpeg');

      im.resize(
        {
          srcData: arrayBufferToString(image),
          dstPath: tmpFile,
          width: Number(req.query.width ?? 0),
          height: Number(req.query.height ?? 0),
          format: 'jpeg',
        },
        async (err: any, buffer: any) => {
          try {
            if (err) {
              console.log('Failed resizing image:', err);
              res.status(500).send(await readFile('assets/no-image_placeholder.png'));
            } else {
              const resizedBuffer = await readFile(tmpFile);
              res.setHeader('Content-type', 'image/jpeg');
              res.setHeader('Cache-Control', 'max-age=3600');
              res.send(resizedBuffer);
            }
          } catch (e) {
            console.log('Failed reading resized image:', e);
            res.status(500).send('Failed reading resized image');
          } finally {
            void unlink(tmpFile);
          }
        },
      );
    } else {
      res.setHeader('Content-type', contentType);
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(image);
    }
  }
}

export default ImageController;
