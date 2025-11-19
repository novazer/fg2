import { model, Schema, Document } from 'mongoose';
import { RecipeTemplate } from '@interfaces/recipe.interface';

const recipeSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  owner_id: { type: String, required: false },
  public: { type: Boolean, default: false },
  // store steps at top-level to match RecipeTemplate
  steps: {
    type: [
      {
        settings: { type: Schema.Types.Mixed, required: true }, // store settings as mixed (string or object)
        durationUnit: { type: String, enum: ['hours', 'days', 'weeks'], required: true },
        duration: { type: Number, required: true },
        waitForConfirmation: { type: Boolean, required: true },
        name: { type: String, required: false },
        confirmationMessage: { type: String, required: false },
      },
    ],
    required: true,
  },
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() },
});

recipeSchema.pre('save', function (next) {
  (this as any).updatedAt = Date.now();
  next();
});

const recipeModel = model<RecipeTemplate & Document>('RecipeTemplate', recipeSchema);

export default recipeModel;
