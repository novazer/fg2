import { model, Schema, Document } from 'mongoose';
import { DeviceFirmware, DeviceFirmwareBinary } from '@interfaces/device.interface';

const deviceFirmwareSchema: Schema = new Schema({
  firmware_id: {
    type: String,
    required: true,
    unique: true,
  },
  class_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: false,
  },
  version: {
    type: String,
    required: true,
  },
});

export const deviceFirmwareModel = model<DeviceFirmware & Document>('DeviceFirmware', deviceFirmwareSchema);

const deviceFirmwareBinarySchema: Schema = new Schema({
  firmware_id: {
    type: String,
    required: true,
    unique: false,
  },
  name: {
    type: String,
    required: false,
  },
  data: {
    type: Buffer,
    required: true,
  },
});

export const deviceFirmwareBinaryModel = model<DeviceFirmwareBinary & Document>('DeviceFirmwareBinary', deviceFirmwareBinarySchema);
