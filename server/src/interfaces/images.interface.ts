export interface Image {
  image_id: string;
  device_id: string;
  timestamp: number;
  data: Buffer;
  format?: 'jpeg' | 'gif';
}
