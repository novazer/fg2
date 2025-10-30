import { model, Schema, Document } from 'mongoose';
import { PasswordToken } from '@interfaces/users.interface';

const passwordTokenSchema: Schema = new Schema({
  user_id: {
    type: String,
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: () => {
      return Date.now();
    },
  },
});

const passwordTokenModel = model<PasswordToken & Document>('PasswordToken', passwordTokenSchema);

export default passwordTokenModel;
