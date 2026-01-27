import { model, Schema, Document } from 'mongoose';
import { Device } from '@interfaces/device.interface';

const deviceSchema: Schema = new Schema({
  device_id: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  class_id: {
    type: String,
    required: false,
  },
  device_type: {
    type: String,
  },
  client_id: {
    type: String,
    required: false,
  },
  owner_id: {
    type: String,
    required: false,
  },
  configuration: {
    type: String,
    required: false,
  },
  serialnumber: {
    type: Number,
    required: false,
  },
  name: {
    type: String,
    required: false,
  },
  lastseen: {
    type: Number,
    required: false,
  },
  current_firmware: {
    type: String,
    required: false,
  },
  pending_firmware: {
    type: String,
    required: false,
  },
  fwupdate_start: {
    type: Number,
    required: false,
  },
  fwupdate_end: {
    type: Number,
    required: false,
  },
  alarms: {
    type: [
      {
        name: { type: String, required: false },
        disabled: { type: Boolean, required: false },
        alarmId: { type: String, required: true },
        sensorType: { type: String, required: true },
        upperThreshold: { type: Number, required: false },
        lowerThreshold: { type: Number, required: false },
        actionType: { type: String, enum: ['email', 'webhook', 'info'], required: true },
        actionTarget: { type: String, required: true },
        cooldownSeconds: { type: Number, required: false },
        isTriggered: { type: Boolean, required: false },
        lastTriggeredAt: { type: Number, required: false },
        additionalInfo: { type: Boolean, required: false },
        extremeValue: { type: Number, required: false },
        latestDataPointTime: { type: Number, required: false },
        retriggerSeconds: { type: Number, required: false },
        lastResolvedAt: { type: Number, required: false },
        webhookMethod: { type: String, enum: ['GET', 'POST', 'PUT'], required: false },
        webhookHeaders: { type: Schema.Types.Mixed, required: false },
        webhookTriggeredPayload: { type: String, required: false },
        webhookResolvedPayload: { type: String, required: false },
        thresholdSeconds: { type: Number, required: false },
        reportWebhookErrors: { type: Boolean, required: false },
      },
    ],
    required: false,
  },
  firmwareSettings: {
    type: {
      autoUpdate: { type: Boolean, required: false },
    },
    required: false,
  },
  cloudSettings: {
    type: {
      autoFirmwareUpdate: { type: Boolean, required: false },
      vpdLeafTempOffsetDay: { type: Number, required: false },
      vpdLeafTempOffsetNight: { type: Number, required: false },
      betaFeatures: { type: Boolean, required: false },
      rtspStream: { type: String, required: false },
      logRtspStreamErrors: { type: Boolean, required: false },
    },
    required: false,
  },
  maintenance_mode_until: {
    type: Number,
    required: false,
  },
  recipe: {
    type: {
      steps: {
        type: [
          {
            settings: { type: Schema.Types.Mixed, required: true },
            durationUnit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'], required: true },
            duration: { type: Number, required: true },
            waitForConfirmation: { type: Boolean, required: true },
            confirmationMessage: { type: String, required: false },
            lastTimeApplied: { type: Number, required: false },
            notified: { type: Boolean, required: false },
            additionalInfo: { type: Boolean, required: false },
          },
        ],
        required: true,
      },
      activeStepIndex: { type: Number, required: true },
      activeSince: { type: Number, required: true },
      loop: { type: Boolean, required: false },
      notifications: { type: String, enum: ['off', 'onStep', 'onConfirmation'], required: false },
      email: { type: String, required: false },
    },
    required: false,
  },
});

const deviceModel = model<Device & Document>('Device', deviceSchema);

export default deviceModel;
