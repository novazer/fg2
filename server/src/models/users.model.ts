import { model, Schema, Document } from 'mongoose';
import { User } from '@interfaces/users.interface';

const userSchema: Schema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  user_id: {
    type: String,
    required: true
  },
  is_admin: {
    type: Boolean,
    required: true,
    default: false
  },
  is_active: {
    type: Boolean,
    required: true,
    default: false
  },
  activation_code: {
    type: String,
    required: false
  },

});

const userModel = model<User & Document>('User', userSchema);

export default userModel;
