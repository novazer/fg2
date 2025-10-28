import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from '../auth/auth.service';

export interface Device {
  device_id: string;
  device_type: string;
  username: string;
  password: string;
  configuration: string;
  settings: any;
  name: string;
}

export interface DeviceClass {
  class_id: string;
  name: string;
  description: string;
  firmware_id: string;
}

export interface DeviceFirmware {
  firmware_id: string;
  name: string;
  version: string;
}

export const device_types = ['climatesensor', 'climatesensorpro'];


@Injectable({
  providedIn: 'root'
})
export class DeviceAdminService {

  private created_devices : Device[] = [];
  public device_classes: BehaviorSubject<any> = new BehaviorSubject<any>([]);

  constructor(private http: HttpClient, private auth: AuthService) {
    this.auth.current_user.subscribe(async (user) => {
      if(user) {
        setInterval(() => {
          this.fetch();
        }, 10000)
        this.fetch();
      }
      else {
        this.device_classes.next([]);
      }
    })
  }

  public async fetch() {
    this.device_classes.next(await firstValueFrom(this.http.get<DeviceClass[]>(environment.API_URL + '/device/firmwareversions')))
  }

  public async createClass(name:string, description: string, concurrent: number, maxfails: number, firmware_id:string) {
    let device_class = await firstValueFrom( this.http.post<DeviceClass>(
      environment.API_URL + '/device/class',
      {
        name: name,
        description: description,
        concurrent: parseInt(concurrent + ''),
        maxfails: parseInt(maxfails + ''),
        firmware_id: firmware_id
      }
    ))
    return device_class;
  }

  public async updateClass(class_id: string, name:string, description: string, concurrent: number, maxfails: number, firmware_id:string) {
    let device_class = await firstValueFrom( this.http.post<DeviceClass>(
      environment.API_URL + '/device/class/' + class_id,
      {
        name: name,
        description: description,
        concurrent: parseInt(concurrent + ''),
        maxfails: parseInt(maxfails + ''),
        firmware_id: firmware_id
      }
    ) )
    return device_class;
  }

  public async createFirmware(file:File, name:string, version:string) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("name", name);
    formData.append("version", version);
    return await firstValueFrom(this.http.post(environment.API_URL + '/device/firmware', formData));
  }
}

@Injectable({
  providedIn: 'root'
})
export class DeviceService {

  public devices: BehaviorSubject<Device[]> = new BehaviorSubject<Device[]>([]);

  constructor(private http: HttpClient, private auth: AuthService) {
    this.fetchDevices();
  }

  fetchDevices() {
    this.auth.current_user.subscribe(async (user) => {
      if(user) {
        const devices = await firstValueFrom(this.http.get<Device[]>(environment.API_URL + '/device'))
        for(let device of devices) {
          try {
            device.settings = JSON.parse(device.configuration);
          }
          catch(err) {
            device.settings = {};
          }
        }
        this.devices.next(devices);
      }
      else {
        this.devices.next([]);
      }
    })
  }

  public async claim(claim_code:string) {
    await firstValueFrom( this.http.post<Device>(environment.API_URL + '/device', {claim_code: claim_code}) )
    this.fetchDevices();
  }

  public async unclaim(device_id:string) {
    await firstValueFrom( this.http.delete(environment.API_URL + '/device/' + device_id) )
    this.fetchDevices();
  }

  public async getConfig(device_id:string) {
    return await firstValueFrom( this.http.get<string>(environment.API_URL + '/device/config/' + device_id) )
  }

  public async getLogs(device_id:string) {
    return await firstValueFrom( this.http.get<string>(environment.API_URL + '/device/logs/' + device_id) )
  }

  public async clearLogs(device_id:string) {
    return await firstValueFrom( this.http.delete(environment.API_URL + '/device/logs/' + device_id) )
  }

  public async setSettings(device_id:string, settings: string) {
    await firstValueFrom( this.http.post<Device>(environment.API_URL + '/device/configure', {device_id: device_id, configuration: settings}) )
  }

  public async setName(device_id:string, name: string) {
    await firstValueFrom( this.http.post<Device>(environment.API_URL + '/device/setname', {device_id: device_id, name: name}) )
  }

  public async testOutputs(device_id: string, outputs:{heater:number, dehumidifier:number, co2:number, lights:number}) {
    await firstValueFrom(this.http.post(environment.API_URL + "/device/test/" + device_id, outputs));
  }

  public async stopTest(device_id: string) {
    await firstValueFrom(this.http.delete(environment.API_URL + "/device/test/" + device_id));
  }

  public async getBySerial(serialnumber: string) : Promise<Device> {
    return await firstValueFrom(this.http.get<Device>(environment.API_URL + "/device/byserial", {params: {serialnumber: serialnumber}}));
  }
}
