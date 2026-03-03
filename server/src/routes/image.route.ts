import { Router } from 'express';
import { Routes } from '@interfaces/routes.interface';
import { authMiddleware } from '@/middlewares/auth.middleware';
import ImageController from '@controllers/image.controller';

class ImageRoute implements Routes {
  public path = '/image';
  public router = Router();
  public imageController = new ImageController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/:device_id`, this.imageController.getDeviceImage);
    this.router.post(`${this.path}/:device_id`, authMiddleware, this.imageController.uploadDeviceImage);
    this.router.delete(`${this.path}/:image_id`, authMiddleware, this.imageController.deleteImage);
  }
}

export default ImageRoute;
