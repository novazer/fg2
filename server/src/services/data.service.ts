
import {InfluxDB, Point, HttpError} from '@influxdata/influxdb-client'
import { INFLUXDB_HOST, INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET } from '@/config';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

const INFLUXDB_DB = "devices"
// You can generate a Token from the "Tokens Tab" in the UI

const influxdb_client = new InfluxDB({url: 'http://influxdb:8086', token: INFLUXDB_TOKEN})
const valid_sensors = [
  'temperature',
  'humidity',
  'avg',
  'p',
  'i',
  'd',
  'co2',
  'rpm',
  'day',
  'sensor_type'
]

const valid_outputs = [
  'heater',
  'dehumidifier',
  'co2',
  'light',
  'fan',
  'relais'
]

class DataService {
  constructor() {
    // this.influxConnect();
  }

  private async influxConnect() {

    // let names = await influxdb_client.getDatabaseNames()
    // console.log(names)
    // if (!names.includes(INFLUXDB_DB)) {
    //   return influxdb_client.createDatabase(INFLUXDB_DB);
    // }
  }

  public async addData(device_id:string, user_id:string, fields:any) {

    // create a write API, expecting point timestamps in nanoseconds (can be also 's', 'ms', 'us')
    const writeApi = influxdb_client.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET, 'ns')
    // setup default tags for all writes through this API

    writeApi.useDefaultTags({device_id: device_id, user_id: user_id })

    try {
      // write point with the current (client-side) timestamp
      const point1 = new Point('status')
      for(let sensor of valid_sensors) {
        if(fields.sensors[sensor] != null) {
          point1.floatField(sensor, parseFloat(fields.sensors[sensor]))
        }
      }
      for(let output of valid_outputs) {
        if(fields.outputs[output] != null) {
          point1.floatField('out_' + output, parseFloat(fields.outputs[output]))
        }
      }
      point1.timestamp(new Date())
      writeApi.writePoint(point1)
      await writeApi.close()
    }
    catch(err) {
      console.log(err)
    }
    //
    // write point with a custom timestamp
  }

  public async addDataWithTimestamp(device_id:string, user_id:string, fields:any) {

    // create a write API, expecting point timestamps in nanoseconds (can be also 's', 'ms', 'us')
    const writeApi = influxdb_client.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET, 'ns')
    // setup default tags for all writes through this API

    writeApi.useDefaultTags({device_id: device_id, user_id: user_id })

    try {
      // write point with the current (client-side) timestamp
      const point1 = new Point('status')
      for(let sensor of valid_sensors) {
        if(fields.sensors[sensor] != null) {
          point1.floatField(sensor, parseFloat(fields.sensors[sensor]))
        }
      }
      for(let output of valid_outputs) {
        if(fields.outputs[output] != null) {
          point1.floatField('out_' + output, parseFloat(fields.outputs[output]))
        }
      }
      point1.timestamp(fields.timestamp * 1000000000)
      writeApi.writePoint(point1)
      await writeApi.close()
    }
    catch(err) {
      console.log(err)
    }
    //
    // write point with a custom timestamp
  }

  public async getSeries(device_id, measure, from, to, interval) {
    const queryApi = influxdb_client.getQueryApi(INFLUXDB_ORG)
    let query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: ${from}, stop: ${to})
        |> filter(fn: (r) => r["_measurement"] == "status")
        |> filter(fn: (r) => r["_field"] == "${measure}")
        |> filter(fn: (r) => r["device_id"] == "${device_id}")
        |> aggregateWindow(every: ${interval}, fn: mean, createEmpty: true)
        |> yield(name: "mean")
        |> limit(n: 50000)
    `
    let rows = await queryApi.collectRows(query)
    rows = rows.map((row: any) => {return {_time: row._time, _value: row._value}})
    return rows;
  }

  public async getLatest(device_id, measure):Promise<number> {
    const queryApi = influxdb_client.getQueryApi(INFLUXDB_ORG)
    let query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -5m)
        |> filter(fn: (r) => r["_measurement"] == "status")
        |> filter(fn: (r) => r["_field"] == "${measure}")
        |> filter(fn: (r) => r["device_id"] == "${device_id}")
        |> aggregateWindow(every: 5m, fn: last, createEmpty: false)
        |> yield(name: "mean")
    `

    let rows = await queryApi.collectRows(query)

    if(rows.length > 0) {
      return rows[rows.length - 1]['_value'];
    }
    else {
      return NaN;
    }

  }

}
export const dataService = new DataService();
