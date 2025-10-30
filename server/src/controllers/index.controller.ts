import { NextFunction, Request, Response } from 'express';
import { User } from '@interfaces/users.interface';
import userModel from '@models/users.model';

class IndexController {
  public users = userModel;

  public index = (req: Request, res: Response, next: NextFunction) => {
    try {
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  };

  public readycheck = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const findUser: User = await this.users.findOne({ username: 'admin' });
      if (findUser) {
        res.sendStatus(200);
      } else {
        res.sendStatus(501);
      }
    } catch (error) {
      next(error);
    }
  };
}

export default IndexController;
