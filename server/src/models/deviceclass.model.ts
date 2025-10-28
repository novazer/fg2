import { model, Schema, Document } from 'mongoose';
import { DeviceClass } from '@interfaces/device.interface';

const deviceClassSchema: Schema = new Schema({
  class_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  concurrent: {
    type: Number,
    required: true,
  },
  maxfails: {
    type: Number,
    required: true,
  },
  firmware_id: {
    type: String,
    required: false,
  },
});

const deviceClassModel = model<DeviceClass & Document>('DeviceClass', deviceClassSchema);

export default deviceClassModel;

