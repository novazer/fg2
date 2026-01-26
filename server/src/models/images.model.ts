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
  data: {
    type: Buffer,
    required: true,
  },
});

imagesSchema.index({ device_id: 1, timestamp: -1 }, { unique: true });

const imageModel = model<Image & Document>('Image', imagesSchema);

export default imageModel;
