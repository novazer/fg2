import { config } from 'dotenv';
import * as process from 'node:process';
config({ path: `.env.${process.env.NODE_ENV || 'development'}.local` });

export const CREDENTIALS = process.env.CREDENTIALS === 'true';
export const ENABLE_SELF_REGISTRATION = process.env.ENABLE_SELF_REGISTRATION === 'true';
export const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
export const REQUIRE_ACTIVATION = process.env.REQUIRE_ACTIVATION === 'true';

export const {
  NODE_ENV,
  PORT,
  API_URL_EXTERNAL,
  DB_HOST,
  DB_PORT,
  DB_DATABASE,
  DB_USER,
  DB_PASSWORD,
  INFLUXDB_HOST,
  INFLUXDB_TOKEN,
  INFLUXDB_ORG,
  INFLUXDB_BUCKET,
  MQTT_URL,
  MQTT_USER,
  MQTT_PASSWORD,
  AUTOMATION_TOKEN,
  SECRET_KEY,
  LOG_FORMAT,
  LOG_DIR,
  ORIGIN,
  SELF_REGISTRATION_PASSWORD,
  ADMINUSER_USERNAME,
  ADMINUSER_PASSWORD,
  SMTP_SENDER,
  SMTP_USER,
  SMTP_SERVER,
  SMTP_PORT,
  SMTP_PASSWORD,
} = process.env;
