import { deviceService, StatusMessage } from '@services/device.service';
import deviceModel from '@models/device.model';
import { Alarm } from '@interfaces/device.interface';
import { SMTP_SENDER } from '@config';
import { mailTransport } from '@services/auth.service';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';

const CACHE_EXPIRATION_SECONDS = 300;

class AlarmService {
  private alarmCache: Map<string, { alarms: Alarm[]; expiresAt: number }> = new Map();

  async onDataReceived(deviceId: string, ownerId: string, data: StatusMessage) {
    // Retrieve alarms from cache or database
    const alarms = await this.getAlarms(deviceId);
    if (!alarms || alarms.length === 0) {
      return;
    }

    // Iterate through the alarms and check conditions
    const values = data.sensors;
    for (const alarm of alarms) {
      const sensorValue = values[alarm.sensorType];
      if (sensorValue !== undefined && !alarm.disabled) {
        const thresholdExceeded =
          (alarm.upperThreshold !== undefined && sensorValue > alarm.upperThreshold) ||
          (alarm.lowerThreshold !== undefined && sensorValue < alarm.lowerThreshold);
        if ((thresholdExceeded && !alarm.isTriggered) || (!thresholdExceeded && alarm.isTriggered)) {
          await this.handleAlarmAction(alarm, deviceId, ownerId, data);
        }
      }
    }
  }

  invalidateAlarmCache(deviceId: string) {
    this.alarmCache.delete(deviceId);
  }

  private async getAlarms(deviceId: string): Promise<Alarm[]> {
    const cached = this.alarmCache.get(deviceId);

    // Check if alarms are cached and not expired
    if (cached && cached.expiresAt > Date.now()) {
      return cached.alarms;
    }

    // Fetch alarms from the database
    const device = await deviceModel.findOne({ device_id: deviceId }).select('alarms').lean();
    const alarms = device?.alarms || [];

    // Cache the alarms with a 5-minute expiration
    this.alarmCache.set(deviceId, { alarms, expiresAt: Date.now() + CACHE_EXPIRATION_SECONDS * 1000 });

    return alarms;
  }

  private async handleAlarmAction(alarm: Alarm, deviceId: string, ownerId: string, data: StatusMessage) {
    const now = Date.now();

    // Check if the action is within the cooldown period
    const inCooldownPeriod = now - (alarm.lastTriggeredAt || 0) < (alarm.cooldownSeconds || 0) * 1000;
    const willSendAlarm = !inCooldownPeriod && !alarm.isTriggered;

    await deviceModel.updateOne(
      { device_id: deviceId, 'alarms.alarmId': alarm.alarmId },
      {
        $set: {
          'alarms.$.lastTriggeredAt': willSendAlarm ? now : alarm.lastTriggeredAt,
          'alarms.$.isTriggered': alarm.isTriggered ? false : !inCooldownPeriod,
        },
      },
    );
    this.alarmCache.delete(deviceId); // Invalidate cache

    if (!alarm.isTriggered && inCooldownPeriod) {
      console.log(`Cooldown active for alarm ${alarm.alarmId} on device ${deviceId}. Skipping action.`);
      return;
    }

    if (alarm.actionType === 'email') {
      try {
        await this.handleEmailAlarm(alarm, deviceId, data);
      } catch (error) {
        console.error(`Failed to send alarm email for device ${deviceId}:`, error);
      }
    } else if (alarm.actionType === 'webhook') {
      try {
        await this.handleWebhookAlarm(alarm, deviceId, data);
      } catch (error) {
        console.error(`Failed to send alarm webhook for device ${deviceId}:`, error);
      }
    } else if (alarm.actionType === 'info') {
      try {
        await this.handleInfoAlarm(alarm, deviceId, data);
      } catch (error) {
        console.error(`Failed to log alarm info for device ${deviceId}:`, error);
      }
    } else {
      console.log(`Alarm action type ${alarm.actionType} is not supported yet.`);
    }
  }

  private async handleEmailAlarm(alarm: Alarm, deviceId: string, data: StatusMessage) {
    const event = alarm.isTriggered ? 'resolved' : 'triggered';
    const name = 'Alarm' + (alarm.name ? ' ' + alarm.name : '');
    const emailSubject = `[FG2] ${name} ${event} for Device ${deviceId}`;
    const emailBody =
      `An alarm has been ${event} for device ${deviceId}.\n\n` +
      `Sensor: ${alarm.sensorType}\n` +
      `Threshold: ${alarm.upperThreshold !== undefined ? `Upper: ${alarm.upperThreshold}` : ''} ` +
      `${alarm.lowerThreshold !== undefined ? `Lower: ${alarm.lowerThreshold}` : ''}\n` +
      `Value: ${data.sensors[alarm.sensorType]}\n` +
      `Alarm Name: ${alarm.name || 'N/A'}\n` +
      `Alarm ID: ${alarm.alarmId}\n`;

    await mailTransport.sendMail({
      from: SMTP_SENDER, // Sender address
      to: alarm.actionTarget, // Recipient email address
      subject: emailSubject, // Email subject
      text: emailBody, // Email body
    });

    console.log(`Alarm email sent to ${alarm.actionTarget} for device ${deviceId} and sensor ${alarm.sensorType}.`);
  }

  private async handleWebhookAlarm(alarm: Alarm, deviceId: string, data: StatusMessage) {
    if (!alarm.actionTarget) {
      console.error(`No webhook URL provided for alarm on device ${deviceId}`);
      return;
    }

    const webhookPayload = JSON.stringify({
      deviceId,
      sensorType: alarm.sensorType,
      value: data.sensors[alarm.sensorType],
      upperThreshold: alarm.upperThreshold,
      lowerThreshold: alarm.lowerThreshold,
      timestamp: new Date().toISOString(),
      event: alarm.isTriggered ? 'resolved' : 'triggered',
      alarmName: alarm.name,
      alarmId: alarm.alarmId,
      lastTriggeredAt: alarm.lastTriggeredAt,
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

  private async handleInfoAlarm(alarm: Alarm, deviceId: string, data: StatusMessage) {
    const name = `Alarm ${alarm.name ?? alarm.alarmId}`;
    const event = alarm.isTriggered ? 'resolved' : 'triggered';
    await deviceService.logMessage(deviceId, {
      title: `${name} ${event}`,
      message:
        `${name} ${event}: Sensor ${alarm.sensorType}, value: ${data.sensors[alarm.sensorType]}, ` +
        `upper threshold=${alarm.upperThreshold || 'n/a'}, lower threshold=${alarm.lowerThreshold || 'n/a'}`,
      severity: alarm.isTriggered ? 1 : 0,
      raw: true,
    });
  }
}

export const alarmService = new AlarmService();
