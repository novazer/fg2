import { HttpException } from '@exceptions/HttpException';
import { AuthUserDto, AuthVhostDto, AuthResourceDto, AuthTopicDto } from '@/dtos/mqttauth.dto';
import { Device } from '@interfaces/device.interface';
import deviceModel from '@models/device.model';
import { isEmpty } from '@utils/util';
import { v4 as uuidv4 } from 'uuid';
import { mqttclient } from '../databases/mqttclient';

const KAFKA_GROUPID = 'mqtt-manager-' + uuidv4();
class MqttAuthService {
  private devices = deviceModel;

  public async user(authData: AuthUserDto): Promise<boolean> {
    if (isEmpty(authData)) {
      throw new HttpException(400, "You're not userData");
    }

    if (authData.username == mqttclient.getUser() && authData.password == mqttclient.getPassword()) {
      return true;
    }

    const findDevice: Device = await this.devices.findOne({ username: authData.username });

    if (!findDevice) {
      console.log('mqtt-auth: device not found:', authData.username);
      return false;
    }

    return authData.password === findDevice.password;
  }

  public async vhost(authData: AuthVhostDto): Promise<boolean> {
    if (isEmpty(authData)) {
      throw new HttpException(400, "You're not userData");
    }

    if (authData.username == mqttclient.getUser()) {
      return true;
    }

    const findDevice: Device = await this.devices.findOne({ username: authData.username });

    if (!findDevice) {
      console.log('mqtt-auth: device not found:', authData.username);
      return false;
    }

    return authData.vhost === '/';
  }

  public async topic(authData: AuthTopicDto): Promise<boolean> {
    if (isEmpty(authData)) {
      throw new HttpException(400, "You're not userData");
    }

    if (authData.username == mqttclient.getUser()) {
      return true;
    }

    const findDevice: Device = await this.devices.findOne({ username: authData.username });

    if (!findDevice) {
      console.log('mqtt-auth: device not found:', authData.username);
      return false;
    }
    if (authData.resource !== 'topic') {
      return false;
    }
    if (authData.name !== 'amq.topic') {
      return false;
    }
    if (!authData.routing_key.startsWith(`.devices.${findDevice.device_id}.`)) {
      console.log('mqtt-auth: routing key not allowed:', authData.routing_key);
      throw new HttpException(403, 'access denied');
    }

    return true;
  }

  public async resource(authData: AuthResourceDto): Promise<boolean> {
    if (isEmpty(authData)) {
      throw new HttpException(400, "You're not userData");
    }

    if (authData.username == mqttclient.getUser()) {
      return true;
    }

    const findDevice: Device = await this.devices.findOne({ username: authData.username });

    if (!findDevice) {
      console.log('mqtt-auth: device not found:', authData.username);
      return false;
    }
    if (authData.vhost !== '/') {
      return false;
    }
    if (authData.resource !== 'exchange') {
      if (authData.resource === 'queue' && authData.name === `mqtt-subscription-${authData.client_id}qos0`) {
        // needed for subscriptions
        return true;
      }

      throw new HttpException(409, 'access denied');
    }
    if (authData.name !== 'amq.topic') {
      throw new HttpException(409, 'access denied');
    }

    return true;
  }
}

export default MqttAuthService;
