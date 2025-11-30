import { deviceService, StatusMessage } from '@services/device.service';
import deviceModel from '@models/device.model';
import { Alarm, Device } from '@interfaces/device.interface';
import { SMTP_SENDER } from '@config';
import { mailTransport } from '@services/auth.service';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import * as console from 'node:console';
import { v4 as uuidv4 } from 'uuid';

const CACHE_EXPIRATION_SECONDS = 600;
const MAINTENANCE_MODE_COOLDOWN_MINUTES = 10;

class AlarmService {
  private alarmCache: Map<string, { device: Pick<Device, 'alarms' | 'maintenance_mode_until'>; expiresAt: number }> = new Map();

  async onDataReceived(deviceId: string, data: StatusMessage) {
    // Retrieve alarms from cache or database
    const device = await this.getDeviceAlarms(deviceId);
    if (!device?.alarms || device.alarms.length <= 0) {
      return;
    }

    for (const alarm of device.alarms) {
      const sensorValue = this.getSensorValue(alarm, data);
      if (
        sensorValue !== undefined &&
        !alarm.disabled &&
        (alarm.upperThreshold || alarm.lowerThreshold) &&
        (alarm.latestDataPointTime ?? 0) < (data.timestamp ? data.timestamp * 1000 : Date.now())
      ) {
        const thresholdExceeded = this.isThresholdExceeded(alarm, sensorValue);
        const inMaintenanceMode = device.maintenance_mode_until && device.maintenance_mode_until > Date.now();
        if (thresholdExceeded !== alarm.isTriggered && !inMaintenanceMode) {
          await this.handleAlarmAction(alarm, deviceId, sensorValue, data.timestamp);
        } else if (alarm.isTriggered) {
          await this.handleAlarmData(alarm, deviceId, sensorValue, data.timestamp);
        }
      }
    }
  }

  public invalidateAlarmCache(deviceId: string) {
    this.alarmCache.delete(deviceId);
  }

  public async maintenanceActivatedForDevice(deviceId: string, durationMinutes: number) {
    await deviceModel.updateOne(
      { device_id: deviceId },
      {
        $set: {
          maintenance_mode_until: Date.now() + (durationMinutes + MAINTENANCE_MODE_COOLDOWN_MINUTES) * 60 * 1000,
        },
      },
    );
    this.invalidateAlarmCache(deviceId);
  }

  private async getDeviceAlarms(deviceId: string): Promise<Pick<Device, 'alarms' | 'maintenance_mode_until'>> {
    const cached = this.alarmCache.get(deviceId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.device;
    }

    // Fetch alarms from the database
    const device = await deviceModel.findOne({ device_id: deviceId }).select('alarms').select('maintenance_mode_until').lean();

    // Cache the alarms with a 5-minute expiration
    this.alarmCache.set(deviceId, {
      device: device as unknown,
      expiresAt: Date.now() + CACHE_EXPIRATION_SECONDS * 1000,
    });

    return device as unknown;
  }

  private async handleAlarmAction(alarm: Alarm, deviceId: string, value: number, timestamp?: number) {
    const now = Date.now();
    const inCooldownPeriod = now - (alarm.lastTriggeredAt || 0) < (alarm.cooldownSeconds || 0) * 1000;

    if (alarm.isTriggered) {
      await deviceModel.updateOne(
        { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
        {
          $set: {
            'alarms.$.isTriggered': false,
            'alarms.$.extremeValue': undefined,
            'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, (timestamp ?? 0) * 1000),
          },
        },
      );
      this.invalidateAlarmCache(deviceId);
    } else if (!inCooldownPeriod) {
      await deviceModel.updateOne(
        { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
        {
          $set: {
            'alarms.$.lastTriggeredAt': now,
            'alarms.$.isTriggered': true,
            'alarms.$.extremeValue': value,
            'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, (timestamp ?? 0) * 1000),
          },
        },
      );
      this.invalidateAlarmCache(deviceId);
    } else {
      console.log(`Cooldown active for alarm ${alarm.alarmId} on device ${deviceId}. Skipping action.`);
      return;
    }

    if (alarm.actionType === 'email') {
      try {
        await this.handleEmailAlarm(alarm, deviceId, value);
      } catch (error) {
        console.error(`Failed to send alarm email for device ${deviceId}:`, error);
      }
    } else if (alarm.actionType === 'webhook') {
      try {
        await this.handleWebhookAlarm(alarm, deviceId, value);
      } catch (error) {
        console.error(`Failed to send alarm webhook for device ${deviceId}:`, error);
      }
    }

    if (alarm.actionType === 'info' || alarm.additionalInfo) {
      try {
        await this.handleInfoAlarm(alarm, deviceId, value);
      } catch (error) {
        console.error(`Failed to log alarm info for device ${deviceId}:`, error);
      }
    }
  }

  private async handleEmailAlarm(alarm: Alarm, deviceId: string, value: number) {
    const event = alarm.isTriggered ? 'resolved' : 'triggered';
    const name = 'Alarm' + (alarm.name ? ' ' + alarm.name : '');
    const emailSubject = `[FG2] ${name} ${event} for Device ${deviceId}`;
    const emailBody =
      `An alarm has been ${event} for device ${deviceId}.\n\n` +
      `Sensor: ${alarm.sensorType}\n` +
      (alarm.sensorType !== 'dehumidifier' && alarm.sensorType !== 'co2_valve'
        ? `Threshold: ${alarm.upperThreshold !== undefined ? `Upper: ${alarm.upperThreshold}` : ''} ` +
          `${alarm.lowerThreshold !== undefined ? `Lower: ${alarm.lowerThreshold}` : ''}\n`
        : '') +
      `Value: ${value}\n` +
      `Alarm Name: ${alarm.name || 'N/A'}\n` +
      `Alarm ID: ${alarm.alarmId}\n` +
      (alarm.isTriggered ? `Extreme Value: ${alarm.extremeValue}\n` : '');

    await mailTransport.sendMail({
      from: SMTP_SENDER,
      to: alarm.actionTarget,
      subject: emailSubject,
      text: emailBody,
    });

    console.log(`Alarm email sent to ${alarm.actionTarget} for device ${deviceId} and sensor ${alarm.sensorType}.`);
  }

  private async handleWebhookAlarm(alarm: Alarm, deviceId: string, value: number) {
    if (!alarm.actionTarget) {
      console.error(`No webhook URL provided for alarm on device ${deviceId}`);
      return;
    }

    const webhookPayload = JSON.stringify({
      deviceId,
      sensorType: alarm.sensorType,
      value: value,
      upperThreshold: alarm.sensorType !== 'dehumidifier' && alarm.sensorType !== 'co2_valve' ? alarm.upperThreshold : undefined,
      lowerThreshold: alarm.sensorType !== 'dehumidifier' && alarm.sensorType !== 'co2_valve' ? alarm.lowerThreshold : undefined,
      timestamp: new Date().toISOString(),
      event: alarm.isTriggered ? 'resolved' : 'triggered',
      alarmName: alarm.name,
      alarmId: alarm.alarmId,
      lastTriggeredAt: alarm.lastTriggeredAt,
      extremeValue: alarm.extremeValue,
    });

    const url = new URL(alarm.actionTarget);
    const isHttps = url.protocol?.startsWith('https');
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookPayload),
      },
    };

    const req = requestFn(options, res => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`Webhook triggered successfully for device ${deviceId} and alarm ${alarm.alarmId}.`);
      } else {
        console.error(`Failed to trigger webhook for device ${deviceId} and alarm ${alarm.alarmId}. Status: ${res.statusCode}`);
      }
    });

    req.on('error', error => {
      console.error(`Error triggering webhook for device ${deviceId}:`, error);
    });

    req.write(webhookPayload);
    req.end();
  }

  private async handleInfoAlarm(alarm: Alarm, deviceId: string, value: number) {
    const name = `Alarm ${alarm.name ?? alarm.alarmId}`;
    const event = alarm.isTriggered ? 'resolved' : 'triggered';
    await deviceService.logMessage(deviceId, {
      title: `${name} ${event}`,
      message:
        `${name} ${event}: Sensor ${alarm.sensorType}, value: ${value}, ` +
        (alarm.sensorType !== 'dehumidifier' && alarm.sensorType !== 'co2_valve'
          ? `upper threshold=${alarm.upperThreshold || 'n/a'}, lower threshold=${alarm.lowerThreshold || 'n/a'}`
          : '') +
        (alarm.isTriggered ? `, extreme value: ${alarm.extremeValue ?? 'n/a'}` : ''),
      severity: alarm.isTriggered ? 1 : 0,
      raw: true,
    });
  }

  private async handleAlarmData(alarm: Alarm, deviceId: string, value: number, timestamp?: number) {
    let newExtreme = alarm.extremeValue || value;
    if (alarm.upperThreshold && value > alarm.upperThreshold) {
      newExtreme = Math.max(newExtreme, value);
    }
    if (alarm.lowerThreshold && value < alarm.lowerThreshold) {
      newExtreme = Math.min(newExtreme, value);
    }

    if (newExtreme !== alarm.extremeValue) {
      await deviceModel.updateOne(
        { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
        {
          $set: {
            'alarms.$.extremeValue': newExtreme,
            'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, (timestamp ?? 0) * 1000),
          },
        },
      );
      this.invalidateAlarmCache(deviceId);
    }
  }

  private getSensorValue(alarm: Alarm, data: StatusMessage): number | undefined {
    switch (alarm.sensorType) {
      case 'temperature':
        return data?.sensors?.temperature;
      case 'humidity':
        return data?.sensors?.humidity;
      case 'co2':
        return data?.sensors?.co2;
      case 'co2_valve':
        return data?.outputs?.co2;
      case 'dehumidifier':
        return data?.outputs?.dehumidifier;
      case 'heater':
        return data?.outputs?.heater;
      case 'light':
        return data?.outputs?.light;
      default:
        return undefined;
    }
  }

  private isThresholdExceeded(alarm: Alarm, sensorValue: number): boolean {
    switch (alarm.sensorType) {
      case 'dehumidifier':
      case 'co2_valve':
        return sensorValue !== undefined && sensorValue > 0;

      case 'heater':
        sensorValue *= 100;
    }

    return (alarm.upperThreshold && sensorValue > alarm.upperThreshold) || (alarm.lowerThreshold && sensorValue < alarm.lowerThreshold);
  }
}

export const alarmService = new AlarmService();
