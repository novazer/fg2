import { model, Schema, Document } from 'mongoose';
import { Device } from '@interfaces/device.interface';

const deviceLogSchema: Schema = new Schema({
  device_id: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: false,
  },
  severity: {
    type: Number,
    required: true,
    default: 0
  },
  time: {
    type: Date,
    required: true,
    default: () => { return Date.now() }
  }
});

const deviceLogModel = model<Device & Document>('DeviceLog', deviceLogSchema);

export default deviceLogModel;

