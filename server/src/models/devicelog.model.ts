import { model, Schema, Document } from 'mongoose';
import { Device, DeviceLog } from '@interfaces/device.interface';

const deviceLogSchema: Schema = new Schema({
  device_id: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: false,
  },
  title: {
    type: String,
    required: false,
  },
  raw: {
    type: Boolean,
    required: false,
  },
  severity: {
    type: Number,
    required: true,
    default: 0,
  },
  time: {
    type: Date,
    required: true,
    default: () => {
      return Date.now();
    },
  },
  categories: {
    type: [String],
    required: false,
  },
  deleted: {
    type: Boolean,
    required: false,
  },
});
deviceLogSchema.index({ device_id: 1, deleted: -1, categories: 1, time: -1 });

const deviceLogModel = model<DeviceLog & Document>('DeviceLog', deviceLogSchema);
void deviceLogModel.createIndexes();

export default deviceLogModel;
