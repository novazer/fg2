import { Request } from 'express';

export interface DataStoredInToken {
  user_id: string;
  is_admin: boolean;
  stay_logged_in?: boolean;
  token_type: 'user' | 'refresh' | 'image';
  secret: string;
}

export interface TokenData {
  token: string;
  expiresIn: number;
  secret: string;
}

export interface RequestWithUser extends Request {
  user_id: string;
  is_admin: boolean;
}

export interface RequestWithToken extends Request {
  token: string;
}
