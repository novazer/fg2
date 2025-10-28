import { model, Schema, Document } from 'mongoose';
import { ClaimCode } from '@interfaces/device.interface';

const claimCodeSchema: Schema = new Schema({
  claim_code: {
    type: String,
    required: false,
    unique: true,
  },
  device_id: {
    type: String,
    required: false,
    unique: true,
  },
});

const claimCodeModel = model<ClaimCode & Document>('ClaimCode', claimCodeSchema);

export default claimCodeModel;

