import { Request } from 'express';
import { User } from '@interfaces/users.interface';

export interface DataStoredInToken {
  user_id: string;
  is_admin: boolean;
}

export interface TokenData {
  token: string;
  expiresIn: number;
}

export interface RequestWithUser extends Request {
  user_id: string;
  is_admin: boolean;
}

export interface RequestWithToken extends Request {
  token: string;
}
