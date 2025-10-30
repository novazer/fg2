import { StatusMessage } from '@services/device.service';
import deviceModel from '@models/device.model';
import { Alarm } from '@interfaces/device.interface';
import { ACTIVATION_SENDER, SMTP_SENDER } from '@config';
import { mailTransport } from '@services/auth.service';
import { request } from 'https';

const CACHE_EXPIRATION_SECONDS = 300;

class AlarmService {
  private alarmCache: Map<string, { alarms: Alarm[]; expiresAt: number }> = new Map();
  private cooldownMap: Map<string, number> = new Map(); // Map to track cooldowns

  async onDataReceived(deviceId: string, ownerId: string, data: StatusMessage) {
    console.log(`AlarmService: Data received for device ${deviceId}, owner ${ownerId}`); // fixme

    // Retrieve alarms from cache or database
    const alarms = await this.getAlarms(deviceId);
    if (!alarms || alarms.length === 0) {
      console.log(`No alarms configured for device ${deviceId}.`);
      return;
    }

    // Iterate through the alarms and check conditions
    const values = data.sensors;
    for (const alarm of alarms) {
      const sensorValue = values[alarm.sensorType];
      if (sensorValue !== undefined) {
        if (
          (alarm.upperThreshold !== undefined && sensorValue > alarm.upperThreshold) ||
          (alarm.lowerThreshold !== undefined && sensorValue < alarm.lowerThreshold)
        ) {
          console.log(`Alarm triggered for sensor ${alarm.sensorType} on device ${deviceId}.`);
          // Handle the alarm action (e.g., send email, webhook, etc.)
          await this.handleAlarmAction(alarm, deviceId, ownerId, data);
        }
      }
    }
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
    const cooldownKey = `${alarm.actionTarget}::${alarm.sensorType}`;
    const now = Date.now();

    // Check if the action is within the cooldown period
    if (this.cooldownMap.has(cooldownKey)) {
      const lastTriggered = this.cooldownMap.get(cooldownKey)!;
      if (now - lastTriggered < (alarm.cooldownSeconds || 0) * 1000) {
        console.log(`Cooldown active for ${cooldownKey}. Skipping action.`);
        return;
      }
    }

    // Update the cooldown timestamp
    this.cooldownMap.set(cooldownKey, now);

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
    } else {
      console.log(`Alarm action type ${alarm.actionType} is not supported.`);
    }
  }

  private async handleEmailAlarm(alarm: Alarm, deviceId: string, data: StatusMessage) {
    const emailSubject = `[FG2] Alarm Triggered for Device ${deviceId}`;
    const emailBody =
      `An alarm has been triggered for device ${deviceId}.\n\n` +
      `Sensor: ${alarm.sensorType}\n` +
      `Threshold: ${alarm.upperThreshold !== undefined ? `Upper: ${alarm.upperThreshold}` : ''} ` +
      `${alarm.lowerThreshold !== undefined ? `Lower: ${alarm.lowerThreshold}` : ''}\n` +
      `Value: ${data.sensors[alarm.sensorType]}\n`;

    await mailTransport.sendMail({
      from: ACTIVATION_SENDER || SMTP_SENDER, // Sender address
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
    });

    const url = new URL(alarm.actionTarget);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookPayload),
      },
    };

    const req = request(options, res => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`Webhook triggered successfully for device ${deviceId}`);
      } else {
        console.error(`Failed to trigger webhook for device ${deviceId}. Status: ${res.statusCode}`);
      }
    });

    req.on('error', error => {
      console.error(`Error triggering webhook for device ${deviceId}:`, error);
    });

    req.write(webhookPayload);
    req.end();
  }
}

export const alarmService = new AlarmService();
