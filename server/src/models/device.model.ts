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
            durationUnit: { type: String, enum: ['hours', 'days', 'weeks'], required: true },
            duration: { type: Number, required: true },
            waitForConfirmation: { type: Boolean, required: true },
            lastTimeApplied: { type: Number, required: false },
          },
        ],
        required: true,
      },
      activeStepIndex: { type: Number, required: true },
      activeSince: { type: Number, required: true }, // epoch seconds
    },
    required: false,
  },
});

const deviceModel = model<Device & Document>('Device', deviceSchema);

export default deviceModel;
