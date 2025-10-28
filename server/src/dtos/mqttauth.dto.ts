import { IsEmail, IsString } from 'class-validator';


export class AuthUserDto {
  @IsString()
  public username: string;

  @IsString()
  public password: string;

  @IsString()
  public vhost: string;

  @IsString()
  public client_id: string;
}

export class AuthVhostDto {
  @IsString()
  public username: string;

  @IsString()
  public vhost: string;

  @IsString()
  public ip: string;

  @IsString()
  public client_id: string;
}

export class AuthTopicDto {
  @IsString()
  public username: string;

  @IsString()
  public resource: string;

  @IsString()
  public name: string;

  @IsString()
  public permission: string;

  @IsString()
  public tags: string;

  @IsString()
  public routing_key: string;

  @IsString()
  public 'variable_map.client_id': string;
}

export class AuthResourceDto {
  @IsString()
  public username: string;

  @IsString()
  public vhost: string;

  @IsString()
  public resource: string;

  @IsString()
  public permission: string;

  @IsString()
  public tags: string;

  @IsString()
  public client_id: string;

  @IsString()
  public name: string;
}
