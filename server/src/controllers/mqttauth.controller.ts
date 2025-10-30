import { NextFunction, Request, Response } from 'express';
import MqttAuthService from '@services/mqttauth.service';
import { AuthResourceDto, AuthTopicDto, AuthUserDto, AuthVhostDto } from '@/dtos/mqttauth.dto';

class MqttAuthController {
  public authService = new MqttAuthService();

  public user = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authData: AuthUserDto = req.body;
      if (await this.authService.user(authData)) {
        res.status(200).send('allow');
      } else {
        res.status(200).send('deny');
      }
    } catch (error) {
      next(error);
    }
  };

  public vhost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authData: AuthVhostDto = req.body;
      if (await this.authService.vhost(authData)) {
        res.status(200).send('allow');
      } else {
        res.status(200).send('deny');
      }
    } catch (error) {
      next(error);
    }
  };

  public topic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authData: AuthTopicDto = req.body;
      if (await this.authService.topic(authData)) {
        res.status(200).send('allow');
      } else {
        res.status(200).send('deny');
      }
      // const userData: User = req.user;
      // const logOutUserData: User = await this.authService.logout(userData);

      // res.setHeader('Set-Cookie', ['Authorization=; Max-age=0']);
      // res.status(200).json({ data: logOutUserData, message: 'logout' });
    } catch (error) {
      next(error);
    }
  };

  public resource = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authData: AuthResourceDto = req.body;
      if (await this.authService.resource(authData)) {
        res.status(200).send('allow');
      } else {
        res.status(200).send('deny');
      }
    } catch (error) {
      next(error);
    }
  };
}

export default MqttAuthController;
