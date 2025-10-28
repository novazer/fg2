export interface User {
  user_id: string;
  password: string;
  username: string;
  is_admin: boolean;
  is_active: boolean;
  activation_code: string;
}

export interface PasswordToken {
  user_id: string;
  token: string;
}
