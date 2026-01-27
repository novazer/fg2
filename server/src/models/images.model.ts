import { Document, model, Schema } from 'mongoose';
import { Image } from '@interfaces/images.interface';

const imagesSchema: Schema = new Schema({
  image_id: {
    type: String,
    required: true,
    unique: true,
  },
  device_id: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Number,
    required: true,
  },
  timestampEnd: {
    type: Number,
    required: false,
  },
  data: {
    type: Buffer,
    required: true,
  },
  format: {
    type: String,
    enum: ['jpeg', 'mp4'],
    required: true,
  },
  duration: {
    type: String,
    enum: ['1d', '1w', '1m'],
    required: false,
  },
});

imagesSchema.index({ device_id: 1, format: 1, timestamp: -1, duration: 1 }, { unique: true });

const imageModel = model<Image & Document>('Image', imagesSchema);
void imageModel.createIndexes();

export default imageModel;
