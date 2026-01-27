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
  logRtspStreamErrors?: boolean;
}

export interface RecipeStep {
  name?: string;
  settings: any;
  durationUnit: 'minutes' | 'hours' | 'days' | 'weeks';
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
  device_id: string;
  message?: string;
  title?: string;
  raw?: boolean;
  severity: number;
  time: Date;
}
