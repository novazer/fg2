export interface Alarm {
  name?: string;
  disabled?: boolean;
  alarmId: string;
  sensorType: string;
  upperThreshold?: number | null;
  lowerThreshold?: number | null;
  actionType: 'email' | 'webhook' | 'info';
  additionalInfo?: boolean;
  actionTarget: string;
  cooldownSeconds?: number;
  isTriggered?: boolean;
  lastTriggeredAt?: number;
  lastResolvedAt?: number;
  retriggerSeconds?: number;
  extremeValue?: number;
  latestDataPointTime?: number;
  webhookMethod?: 'GET' | 'POST' | 'PUT';
  webhookHeaders?: { [key: string]: string };
  webhookTriggeredPayload?: string;
  webhookResolvedPayload?: string;
  thresholdSeconds?: number;
  reportWebhookErrors?: boolean;
  tunnelWebhook?: boolean;
}

export interface FirmwareSettings {
  /** @deprecated */
  autoUpdate?: boolean;
}

export interface CloudSettings {
  autoFirmwareUpdate?: boolean;
  vpdLeafTempOffsetDay?: number;
  vpdLeafTempOffsetNight?: number;
  betaFeatures?: boolean;
  rtspStream?: string;
  rtspStreamTransport?: string;
  logRtspStreamErrors?: boolean;
  tunnelRtspStream?: boolean;
  maintenanceWebcamOff?: boolean;
}

export type DiaryLifecycleStage = 'germination' | 'seedling' | 'vegetative' | 'flowering' | 'drying' | 'curing';

export interface DiaryEntryData {
  co2FillingRest: number;
  co2FillingInitial: number;
  newLifecycleStage: DiaryLifecycleStage;
  lifecycleName: string;
  lightMeasurement: number;
  distanceMeasurement: number;
  tdsMeasurement: number;
  ecMeasurement: number;
  outsideTemperatureMeasurement: number;
  phMeasurement: number;
}

export interface DiaryEntry {
  message?: string;
  title: string;
  time: Date;
  category: string;
  data?: Partial<DiaryEntryData>;
  images?: string[];
}

export type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export interface RecipeStep {
  name?: string;
  settings: any;
  durationUnit: DurationUnit;
  duration: number;
  waitForConfirmation: boolean;
  confirmationMessage?: string;
  lastTimeApplied?: number;
  notified?: boolean;
}

export interface Recipe {
  steps: RecipeStep[];
  activeStepIndex: number;
  activeSince: number;
  loop?: boolean;
  notifications?: 'off' | 'onStep' | 'onConfirmation';
  additionalInfo?: boolean;
  email?: string;
}

export interface Device {
  _id?: string;
  name?: string;
  device_id: string;
  username: string;
  password: string;
  class_id: string;
  device_type: string;
  configuration: string;
  owner_id: string;
  serialnumber: Number;
  lastseen: Number;
  current_firmware: string;
  pending_firmware: string;
  fwupdate_start: number;
  fwupdate_end: number;
  alarms?: [Alarm];
  firmwareSettings?: FirmwareSettings;
  cloudSettings?: CloudSettings;
  maintenance_mode_until?: number;
  recipe?: Recipe;
}

export interface DeviceClass {
  class_id: string;
  name: string;
  description: string;
  concurrent: number;
  maxfails: number;
  firmware_id: string;
  beta_firmware_id?: string;
}

export interface DeviceClassCount {
  class: DeviceClass;
  count: number;
}

export interface ClaimCode {
  claim_code: string;
  device_id: string;
}

export interface DeviceFirmware {
  firmware_id: string;
  name: string;
  version: string;
  class_id: string;
}

export interface DeviceFirmwareBinary {
  firmware_id: string;
  name: string;
  data: Buffer;
}

export interface DeviceLog {
  _id: string;
  device_id: string;
  message?: string;
  title?: string;
  raw?: boolean;
  severity: number;
  time: Date;
  categories?: string[];
  deleted?: boolean;
  data?: Partial<DiaryEntryData>;
  images?: string[];
}

export interface Image {
  image_id: string;
  device_id: string;
  timestamp: number;
  timestampEnd?: number;
  data: Buffer;
  format?: 'jpeg' | 'mp4' | 'user/jpeg';
  duration?: '1d' | '1w' | '1m';
}

export interface User {
  user_id: string;
  password: string;
  username: string;
  is_admin: boolean;
  is_active: boolean;
  activation_code: string;
}

export interface PasswordToken {
  user_id: string;
  token: string;
}

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

