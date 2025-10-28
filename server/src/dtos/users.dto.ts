import { IsBoolean, IsEmail, IsString } from 'class-validator';


export class LoginDto {
  @IsString()
  public username: string;

  @IsString()
  public password: string;
}

export class ActivationDto {
  @IsString()
  public activation_code: string;
}

export class PasswordResetDto {
  @IsString()
  public password: string;
  @IsString()
  public token: string;
}

export class CreateUserDto {
  @IsString()
  public username: string;

  @IsString()
  public password: string;

  @IsBoolean()
  public is_admin: boolean;
}
