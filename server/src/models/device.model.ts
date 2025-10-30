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
        sensorType: { type: String, required: true },
        upperThreshold: { type: Number, required: false },
        lowerThreshold: { type: Number, required: false },
        actionType: { type: String, enum: ['email', 'webhook', 'info'], required: true },
        actionTarget: { type: String, required: true },
        cooldownSeconds: { type: Number, required: true },
      },
    ],
    required: false,
  },
});

const deviceModel = model<Device & Document>('Device', deviceSchema);

export default deviceModel;
