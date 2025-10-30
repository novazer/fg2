import { IsEmail, IsNumber, IsString } from 'class-validator';

export class AddDeviceDto {
  @IsString()
  public class_id: string;
  @IsString()
  public device_type: string;
}

export class RegisterDeviceDto {
  @IsString()
  public registration_password: string;
  @IsString()
  public device_id: string;
  @IsString()
  public username: string;
  @IsString()
  public password: string;
  @IsString()
  public device_type: string;
}

export class AddDeviceClassDto {
  @IsString()
  public name: string;

  @IsString()
  public description: string;

  @IsString()
  public firmware_id: string;

  @IsNumber()
  public concurrent: number;

  @IsNumber()
  public maxfails: number;
}

export class AddDeviceFirmwareDto {
  @IsString()
  public name: string;
  @IsString()
  public version: string;
}

export class ClaimDeviceDto {
  @IsString()
  public claim_code: string;
}

export class ConfigureDeviceDto {
  @IsString()
  public device_id: string;
  @IsString()
  public configuration: string;
}

export class SetNameDto {
  @IsString()
  public device_id: string;
  @IsString()
  public name: string;
}

export class TestDeviceDto {
  @IsNumber()
  public heater: number;
  @IsNumber()
  public dehumidifier: number;
  @IsNumber()
  public co2: number;
  @IsNumber()
  public lights: number;
  @IsNumber()
  public fanint: number;
  @IsNumber()
  public fanext: number;
  @IsNumber()
  public fanbw: number;
}
