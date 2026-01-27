export interface Image {
  image_id: string;
  device_id: string;
  timestamp: number;
  timestampEnd?: number;
  data: Buffer;
  format?: 'jpeg' | 'mp4';
  duration?: '1d' | '1w' | '1m';
}
