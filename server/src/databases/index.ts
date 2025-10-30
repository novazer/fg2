import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE, INFLUXDB_HOST } from '@config';
const Influx = require('influx');

//console.log(`mongodb://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`)

export const dbConnection = {
  url: `mongodb://${DB_HOST}:${DB_PORT}/${DB_DATABASE}`,
  options: {
    authSource: 'admin',
    user: DB_USER,
    pass: DB_PASSWORD,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  },
};

const INFLUXDB_DB = 'devices';

export const influxConnection = {
  host: INFLUXDB_HOST,
  database: INFLUXDB_DB,
  schema: [
    {
      measurement: INFLUXDB_DB,
      fields: {
        temperature: Influx.FieldType.FLOAT,
        humidity: Influx.FieldType.FLOAT,
        co2: Influx.FieldType.FLOAT,
        out_heater: Influx.FieldType.FLOAT,
        out_dehumidifier: Influx.FieldType.FLOAT,
        out_co2: Influx.FieldType.FLOAT,
        out_lights: Influx.FieldType.FLOAT,
      },
      tags: ['device_id', 'user_id'],
    },
  ],
};
