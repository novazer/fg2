import { HttpException } from '@exceptions/HttpException';
import { AuthUserDto, AuthVhostDto, AuthResourceDto, AuthTopicDto } from '@/dtos/mqttauth.dto';
import { Device } from '@interfaces/device.interface';
import deviceModel from '@models/device.model';
import { isEmpty } from '@utils/util';
import { v4 as uuidv4 } from 'uuid';
import { mqttclient } from '../databases/mqttclient';

const KAFKA_GROUPID = 'mqtt-manager-' + uuidv4();
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
class MqttAuthService {
  private devices = deviceModel;

  constructor() {}

  public async user(authData: AuthUserDto): Promise<boolean> {
    if (isEmpty(authData)) throw new HttpException(400, "You're not userData");

    if (authData.username == mqttclient.getUser() && authData.password == mqttclient.getPassword()) {
      return true;
    }

    return !(!UUID_REGEX.test(authData.username) || !UUID_REGEX.test(authData.password));
  }

  public async vhost(authData: AuthVhostDto): Promise<boolean> {
    if (isEmpty(authData)) throw new HttpException(400, "You're not userData");

    if (authData.username == mqttclient.getUser()) {
      return true;
    }

    return UUID_REGEX.test(authData.username);
  }

  public async topic(authData: AuthTopicDto): Promise<boolean> {
    if (isEmpty(authData)) throw new HttpException(400, "You're not userData");

    if (authData.username == mqttclient.getUser()) {
      return true;
    }

    return UUID_REGEX.test(authData.username);
  }

  public async resource(authData: AuthResourceDto): Promise<boolean> {
    if (isEmpty(authData)) throw new HttpException(400, "You're not userData");

    if (authData.username == mqttclient.getUser()) {
      return true;
    }

    return UUID_REGEX.test(authData.username);
  }
}

export default MqttAuthService;
