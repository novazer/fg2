import { Router } from 'express';
import { Routes } from '@interfaces/routes.interface';
import validationMiddleware from '@/middlewares/validation.middleware';
import { authMiddleware, authAdminMiddleware } from '@/middlewares/auth.middleware';
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
  }
}

export default ImageRoute;
