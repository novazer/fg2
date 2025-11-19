import { RecipeStep } from '@interfaces/device.interface';

export type DurationUnit = 'hours' | 'days' | 'weeks';

export type RecipeTemplateStep = Omit<RecipeStep, 'lastTimeApplied'>;

export type RecipeTemplate = {
  _id?: string;
  name: string;
  owner_id?: string;
  public?: boolean;
  createdAt?: number;
  updatedAt?: number;
  steps: RecipeTemplateStep[];
};
