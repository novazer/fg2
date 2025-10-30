import { Router } from 'express';
import MqttAuthController from '@controllers/mqttauth.controller';
import { AuthResourceDto, AuthTopicDto, AuthUserDto, AuthVhostDto } from '@dtos/mqttauth.dto';
import { Routes } from '@interfaces/routes.interface';
import validationMiddleware from '@middlewares/validation.middleware';

class MqttAuthRoute implements Routes {
  public path = '/mqttauth/';
  public router = Router();
  public authController = new MqttAuthController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}user`, this.authController.user);
    this.router.post(`${this.path}vhost`, this.authController.vhost);
    this.router.post(`${this.path}topic`, this.authController.topic);
    this.router.post(`${this.path}resource`, this.authController.resource);
  }
}

export default MqttAuthRoute;
