import { deviceService, StatusMessage } from '@services/device.service';
import deviceModel from '@models/device.model';
import { Alarm, Device } from '@interfaces/device.interface';
import { SMTP_SENDER } from '@config';
import { mailTransport } from '@services/auth.service';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import * as console from 'node:console';
import { dataService } from '@services/data.service';

const CACHE_EXPIRATION_SECONDS = 600;
const MAINTENANCE_MODE_COOLDOWN_MILLIS = 10 * 60 * 1000;

const ACTION_TARGET_SEPARATOR = '|';

class AlarmService {
  private alarmCache: Map<string, { deviceJson: string; expiresAt: number }> = new Map();
  private lastTimeNotExceededCache: Map<string, number> = new Map();

  async onDataReceived(deviceId: string, data: StatusMessage) {
    // Retrieve alarms from cache or database
    const device = await this.getDeviceAlarms(deviceId);
    if (!device?.alarms || device.alarms.length <= 0) {
      return;
    }

    for (const alarm of device.alarms) {
      const sensorValue = this.getSensorValue(alarm, data);
      const timestamp = data.timestamp ? data.timestamp * 1000 : Date.now();
      if (sensorValue !== undefined && !alarm.disabled && (alarm.latestDataPointTime ?? 0) < timestamp) {
        const thresholdExceeded = await this.isThresholdExceeded(deviceId, alarm, sensorValue, timestamp);
        const inMaintenanceMode = device.maintenance_mode_until && device.maintenance_mode_until + MAINTENANCE_MODE_COOLDOWN_MILLIS > Date.now();

        if (thresholdExceeded !== (alarm.isTriggered ?? false) && !inMaintenanceMode) {
          await this.handleAlarm(alarm, deviceId, sensorValue, timestamp);
        } else {
          if (alarm.isTriggered && sensorValue !== null && !isNaN(sensorValue)) {
            await this.handleAlarmData(alarm, deviceId, sensorValue, timestamp);
          }

          const lastAlarmAction = Math.max(alarm.lastTriggeredAt || 0, alarm.lastResolvedAt || 0);
          if (
            alarm.actionType !== 'email' &&
            alarm.retriggerSeconds >= 60 &&
            lastAlarmAction > 0 &&
            lastAlarmAction + alarm.retriggerSeconds * 1000 < Date.now()
          ) {
            await this.handleAlarmRetrigger(alarm, deviceId, sensorValue, timestamp);
          }
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
          maintenance_mode_until: Date.now() + durationMinutes * 60 * 1000,
        },
      },
    );
    this.invalidateAlarmCache(deviceId);
  }

  private async getDeviceAlarms(deviceId: string): Promise<Pick<Device, 'alarms' | 'maintenance_mode_until'>> {
    const cached = this.alarmCache.get(deviceId);

    if (cached && cached.expiresAt > Date.now()) {
      return JSON.parse(cached.deviceJson);
    }

    // Fetch alarms from the database
    const device = await deviceModel.findOne({ device_id: deviceId }).select('alarms').select('maintenance_mode_until').lean();
    const deviceJson = JSON.stringify(device);

    // Cache the alarms with a 5-minute expiration
    this.alarmCache.set(deviceId, {
      deviceJson: deviceJson,
      expiresAt: Date.now() + CACHE_EXPIRATION_SECONDS * 1000,
    });

    return device as unknown;
  }

  private async handleAlarm(alarm: Alarm, deviceId: string, value: number, timestamp: number) {
    const now = Date.now();
    const minCooldownSeconds = alarm.actionType === 'email' ? 300 : 0;
    const inCooldownPeriod = now - (alarm.lastTriggeredAt || 0) < Math.max(alarm.cooldownSeconds || 0, minCooldownSeconds) * 1000;

    if (alarm.isTriggered) {
      await deviceModel.updateOne(
        { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
        {
          $set: {
            'alarms.$.isTriggered': false,
            'alarms.$.extremeValue': undefined,
            'alarms.$.lastResolvedAt': now,
            'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, timestamp),
          },
        },
      );
      this.invalidateAlarmCache(deviceId);
      alarm.isTriggered = false;
    } else if (!inCooldownPeriod) {
      await deviceModel.updateOne(
        { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
        {
          $set: {
            'alarms.$.lastTriggeredAt': now,
            'alarms.$.isTriggered': true,
            'alarms.$.extremeValue': value,
            'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, timestamp),
          },
        },
      );
      this.invalidateAlarmCache(deviceId);
      alarm.isTriggered = true;
    } else {
      return;
    }

    return this.handleAlarmAction(alarm, deviceId, value);
  }

  private async handleAlarmAction(alarm: Alarm, deviceId: string, value: number) {
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
    const event = alarm.isTriggered ? 'triggered' : 'resolved';
    const name = 'Alarm' + (alarm.name ? ' ' + alarm.name : '');
    const emailSubject = `[FG2] ${name} ${event} for Device ${deviceId}`;
    const emailBody =
      `An alarm has been ${event} for device ${deviceId}.\n\n` +
      `Sensor: ${alarm.sensorType}\n` +
      (this.hasThresholds(alarm)
        ? `Threshold: ${alarm.upperThreshold !== undefined ? `Upper: ${alarm.upperThreshold}` : ''} ` +
          `${alarm.lowerThreshold !== undefined ? `Lower: ${alarm.lowerThreshold}` : ''}\n`
        : '') +
      `Value: ${value}\n` +
      `Alarm Name: ${alarm.name || 'N/A'}\n` +
      `Alarm ID: ${alarm.alarmId}\n` +
      (!alarm.isTriggered && this.hasThresholds(alarm) ? `Extreme Value: ${alarm.extremeValue}\n` : '');

    const actionTarget = this.getActionTarget(alarm);
    await mailTransport.sendMail({
      from: SMTP_SENDER,
      to: actionTarget,
      subject: emailSubject,
      text: emailBody,
    });

    console.log(`Alarm email sent to ${actionTarget} for device ${deviceId} and sensor ${alarm.sensorType}.`);
  }

  private async handleWebhookAlarm(alarm: Alarm, deviceId: string, value: number) {
    const actionTarget = this.getActionTarget(alarm);
    if (!actionTarget) {
      console.error(`No webhook URL provided for alarm on device ${deviceId}`);
      return;
    }

    const defaultPayload = JSON.stringify({
      deviceId,
      sensorType: alarm.sensorType,
      value: value,
      upperThreshold: this.hasThresholds(alarm) ? alarm.upperThreshold : undefined,
      lowerThreshold: this.hasThresholds(alarm) ? alarm.lowerThreshold : undefined,
      timestamp: new Date().toISOString(),
      event: alarm.isTriggered ? 'triggered' : 'resolved',
      alarmName: alarm.name,
      alarmId: alarm.alarmId,
      lastTriggeredAt: alarm.lastTriggeredAt,
      extremeValue: !alarm.isTriggered && this.hasThresholds(alarm) ? alarm.extremeValue : undefined,
    });

    let webhookPayload;
    if (alarm.isTriggered) {
      webhookPayload = alarm.webhookTriggeredPayload || defaultPayload;
    } else {
      webhookPayload = alarm.webhookResolvedPayload || defaultPayload;
    }

    const url = new URL(actionTarget);
    const isHttps = url.protocol?.startsWith('https');
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: alarm.webhookMethod ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookPayload),
        ...(alarm.webhookHeaders ?? {}),
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
      const message = error.message || String(error) || 'Unknown error';
      console.error(`Failed to trigger webhook for device ${deviceId} and alarm ${alarm.alarmId}: ${message}`);

      if (alarm.reportWebhookErrors) {
        void deviceService.logMessage(deviceId, {
          title: `Webhook error for alarm ${alarm.name ?? alarm.alarmId}`,
          message,
          severity: 1,
          raw: true,
          categories: ['alarm', 'alarm-error'],
        });
      }
    });

    req.write(webhookPayload);
    req.end();
  }

  private async handleInfoAlarm(alarm: Alarm, deviceId: string, value: number) {
    const name = `Alarm ${alarm.name ?? alarm.alarmId}`;
    const event = alarm.isTriggered ? 'triggered' : 'resolved';
    await deviceService.logMessage(deviceId, {
      title: `${name} ${event}`,
      message:
        `${name} ${event}: Sensor ${alarm.sensorType}, value: ${value}` +
        (this.hasThresholds(alarm) ? `, upper threshold=${alarm.upperThreshold || 'n/a'}, lower threshold=${alarm.lowerThreshold || 'n/a'}` : '') +
        (!alarm.isTriggered && this.hasThresholds(alarm) ? `, extreme value: ${alarm.extremeValue ?? 'n/a'}` : ''),
      severity: alarm.isTriggered ? 1 : 0,
      raw: true,
      categories: ['alarm', 'alarm-' + (alarm.isTriggered ? 'triggered' : 'resolved')],
    });
  }

  private async handleAlarmData(alarm: Alarm, deviceId: string, value: number, timestamp: number) {
    let newExtreme = alarm.extremeValue || value;
    if (alarm.upperThreshold !== null && alarm.upperThreshold !== undefined && value > alarm.upperThreshold) {
      newExtreme = Math.max(newExtreme, value);
    }
    if (alarm.lowerThreshold !== null && alarm.lowerThreshold !== undefined && value < alarm.lowerThreshold) {
      newExtreme = Math.min(newExtreme, value);
    }

    if (newExtreme !== alarm.extremeValue) {
      await deviceModel.updateOne(
        { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
        {
          $set: {
            'alarms.$.extremeValue': newExtreme,
            'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, timestamp),
          },
        },
      );
      this.invalidateAlarmCache(deviceId);
      alarm.extremeValue = newExtreme;
    }
  }

  private async handleAlarmRetrigger(alarm: Alarm, deviceId: string, sensorValue: number, timestamp: number) {
    await deviceModel.updateOne(
      { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
      {
        $set: {
          'alarms.$.lastTriggeredAt': alarm.isTriggered ? Date.now() : alarm.lastTriggeredAt,
          'alarms.$.lastResolvedAt': alarm.isTriggered ? alarm.lastResolvedAt : Date.now(),
          'alarms.$.latestDataPointTime': Math.max(alarm.latestDataPointTime ?? 0, timestamp),
        },
      },
    );
    this.invalidateAlarmCache(deviceId);
    await this.handleAlarmAction(alarm, deviceId, sensorValue);
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
      case 'fan':
        return data?.outputs?.fan;
      case 'heater':
        return data?.outputs?.heater * 100;
      case 'light':
        return data?.outputs?.light;
      default:
        return undefined;
    }
  }

  private async isThresholdExceeded(deviceId: string, alarm: Alarm, sensorValue: number, timestamp: number): Promise<boolean> {
    if (sensorValue === undefined || sensorValue === null || isNaN(sensorValue)) {
      return alarm.isTriggered ?? false;
    }

    const exceeded = this.isThresholdValueExceeded(alarm, sensorValue);

    if (alarm.thresholdSeconds && alarm.thresholdSeconds > 4) {
      if (!exceeded) {
        this.lastTimeNotExceededCache.set(alarm.alarmId, timestamp);
      } else {
        if (!this.lastTimeNotExceededCache.has(alarm.alarmId)) {
          let measure;
          switch (alarm.sensorType) {
            case 'dehumidifier':
            case 'heater':
            case 'light':
            case 'fan':
              measure = 'out_' + alarm.sensorType;
              break;

            case 'co2_valve':
              measure = 'out_co2';
              break;

            default:
              measure = alarm.sensorType;
              break;
          }

          const series = await dataService.getSeries(deviceId, measure, `-${alarm.thresholdSeconds + 4}s`, '-4s', '5s');
          const lastTimeNotExceeded = Date.parse(
            series
              .reverse()
              .filter(s => s._value !== undefined && s._value !== null && !isNaN(s._value))
              .find(s => !this.isThresholdValueExceeded(alarm, s._value * (measure === 'out_heater' ? 100 : 1)))?._time,
          );

          if (!isNaN(lastTimeNotExceeded)) {
            this.lastTimeNotExceededCache.set(alarm.alarmId, lastTimeNotExceeded);
          } else {
            this.lastTimeNotExceededCache.set(alarm.alarmId, Date.now() - 5000);
          }
        }

        if (Date.now() - this.lastTimeNotExceededCache.get(alarm.alarmId) < alarm.thresholdSeconds * 1000) {
          return false;
        }
      }
    }

    return exceeded;
  }

  private isThresholdValueExceeded(alarm: Alarm, sensorValue: number): boolean {
    switch (alarm.sensorType) {
      case 'dehumidifier':
      case 'co2_valve':
        return sensorValue > 0;
    }

    return (
      (alarm.upperThreshold !== null && alarm.upperThreshold !== undefined && sensorValue > alarm.upperThreshold) ||
      (alarm.lowerThreshold !== null && alarm.lowerThreshold !== undefined && sensorValue < alarm.lowerThreshold)
    );
  }

  private hasThresholds(alarm: Alarm): boolean {
    if (alarm.sensorType === 'dehumidifier' || alarm.sensorType === 'co2_valve') {
      return false;
    }

    return (
      (alarm.upperThreshold !== null && alarm.upperThreshold !== undefined) || (alarm.lowerThreshold !== null && alarm.lowerThreshold !== undefined)
    );
  }

  private getActionTarget(alarm: Alarm): string {
    if (alarm.actionTarget?.indexOf(ACTION_TARGET_SEPARATOR) >= 0) {
      return alarm.actionTarget.split(ACTION_TARGET_SEPARATOR)[alarm.isTriggered ? 0 : 1].trim();
    }

    return alarm.actionTarget?.trim() ?? '';
  }
}

export const alarmService = new AlarmService();
