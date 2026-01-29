import { NextFunction, Request, Response } from 'express';
import { LoginDto, SignupDto, ActivationDto, PasswordResetDto } from '@dtos/users.dto';
import { DataStoredInToken, RequestWithUser, RequestWithToken } from '@interfaces/auth.interface';
import { User } from '@interfaces/users.interface';
import AuthService from '@services/auth.service';
import { SECRET_KEY } from '@/config';
import { verify } from 'jsonwebtoken';
import { HttpException } from '@exceptions/HttpException';

class AuthController {
  public authService = new AuthService();

  public signUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData: SignupDto = req.body;
      const signUpUserData: User = await this.authService.signup(userData);

      res.status(201).json({ data: signUpUserData, message: 'signup' });
    } catch (error) {
      next(error);
    }
  };

  public activate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData: ActivationDto = req.body;
      await this.authService.activate(userData);

      res.status(201).json({ message: 'activated' });
    } catch (error) {
      next(error);
    }
  };

  public logIn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData: LoginDto = req.body;
      const { userToken, refreshToken, imageToken, findUser } = await this.authService.login(userData);

      res.status(200).json({
        user: { username: findUser.username, user_id: findUser.user_id, is_admin: findUser.is_admin },
        userToken: userToken,
        refreshToken: refreshToken,
        imageToken: imageToken,
      });
    } catch (error) {
      next(error);
    }
  };

  public loginWithToken = async (req: RequestWithToken, res: Response, next: NextFunction) => {
    try {
      const token: string = req.body.token;
      const { userToken } = await this.authService.loginWithToken(token);

      res.status(200).json({
        userToken: userToken,
      });
    } catch (error) {
      next(error);
    }
  };

  public refresh = async (req: RequestWithToken, res: Response, next: NextFunction) => {
    const token = req.body.token;
    if (token) {
      try {
        const secretKey: string = SECRET_KEY;
        const verificationResponse = (await verify(token, secretKey)) as DataStoredInToken;

        if (verificationResponse.user_id && verificationResponse.token_type === 'refresh') {
          const { userToken, refreshToken, imageToken } = await this.authService.refresh(verificationResponse);

          res.status(200).json({
            userToken: userToken,
            refreshToken: refreshToken,
            imageToken: imageToken,
          });
          return;
        }
      } catch (error) {
        console.log('Failed to verify token', error);
      }

      next(new HttpException(401, 'Wrong authentication token'));
    } else {
      next(new HttpException(404, 'Authentication token missing'));
    }
  };

  public logOut = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Set-Cookie', ['Authorization=; Max-age=0']);
      res.status(200).json({});
    } catch (error) {
      next(error);
    }
  };

  public changePassword = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userData: LoginDto = req.body;
      this.authService.changePassword(req.user_id, userData.password);
      res.status(200).json({});
    } catch (error) {
      next(error);
    }
  };

  public getPasswordToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData: LoginDto = req.body;
      await this.authService.generatePasswordToken(userData.username);

      res.status(201).json({ message: 'sent' });
    } catch (error) {
      next(error);
    }
  };

  public resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resetData: PasswordResetDto = req.body;
      await this.authService.changePasswordWithToken(resetData.token, resetData.password);
      res.status(200).json({});
    } catch (error) {
      next(error);
    }
  };
}

export default AuthController;
