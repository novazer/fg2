import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
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
  maintenance_mode_until?: number;
  cloudSettings?: {
    autoFirmwareUpdate?: boolean;
    vpdLeafTempOffsetDay?: number;
    vpdLeafTempOffsetNight?: number;
  }
}

export interface DeviceLog {
  _id: string,
  device_id: string,
  message?: string,
  title?: string,
  raw?: boolean,
  severity: 0 | 1 | 2,
  time: string,
  categories?: string[],
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
        //setInterval(() => {
        //  this.fetch();
        //}, 10000)
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

  public settingsChanged = new Subject<{device_id: string, settings: any}>();

  public devices: BehaviorSubject<Device[]> = new BehaviorSubject<Device[]>([]);

  constructor(private http: HttpClient, private auth: AuthService) {
    this.fetchDevices();
  }

  fetchDevices() {
    this.auth.current_user.subscribe(() => this.refetchDevices());
  }

  public async refetchDevices() {
    if (!this.auth.authenticated.getValue()) {
      this.devices.next([]);
      return;
    }

    try {
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
    } catch(e) {
      console.log('Failed fetching devices', e);
      this.devices.next([]);
    }
  }

  public async claim(claim_code:string) {
    await firstValueFrom( this.http.post<Device>(environment.API_URL + '/device', {claim_code: claim_code}) )
    await this.refetchDevices();
  }

  public async unclaim(device_id:string) {
    await firstValueFrom( this.http.delete(environment.API_URL + '/device/' + device_id) )
    await this.refetchDevices();
  }

  public async getConfig(device_id:string) {
    return await firstValueFrom( this.http.get<string>(environment.API_URL + '/device/config/' + device_id) )
  }

  public async getAlarms(device_id:string) {
    return await firstValueFrom( this.http.get<string>(environment.API_URL + '/device/alarms/' + device_id) )
  }

  public async getCloudSettings(device_id:string) {
    return await firstValueFrom( this.http.get<string>(environment.API_URL + '/device/cloudsettings/' + device_id) )
  }

  public async getRecipe(device_id:string) {
    // returns the recipe object
    return await firstValueFrom( this.http.get<any>(environment.API_URL + '/device/recipe/' + device_id) )
  }

  public async setRecipe(device_id:string, recipe: any) {
    const payload = { device_id, recipe };
    await firstValueFrom( this.http.post(environment.API_URL + '/device/recipe', payload) );
  }

  public async getLogs(device_id:string, timestampFrom?: number, timestampTo?: number, deleted?: boolean): Promise<DeviceLog[]> {
    return await firstValueFrom( this.http.get<DeviceLog[]>(environment.API_URL + '/device/logs/' + device_id + '?from=' + Number(timestampFrom ?? 0) + '&to=' + Number(timestampTo ?? Date.now()) + '&deleted=' + (deleted ? '1' : '')) );
  }

  public async getDeviceImageUrl(device_id: string, format: 'mp4' | 'jpeg', timestamp?: number, duration?: string): Promise<string | undefined> {
    return `${environment.API_URL}/image/${device_id}?timestamp=${timestamp ?? (Math.ceil(Date.now()/5000)*5000)}&token=${await this.auth.getToken()}&format=${format}&duration=${duration ?? ''}`;
  }

  public async clearLogs(device_id:string) {
    return await firstValueFrom( this.http.delete(environment.API_URL + '/device/logs/' + device_id) )
  }

  public async setSettings(device_id:string, settings: string) {
    await firstValueFrom(this.http.post<Device>(environment.API_URL + '/device/configure', { device_id: device_id, configuration: settings }));
    // Notify subscribers that settings for this device have changed
    this.settingsChanged.next({ device_id, settings });
  }

  public async setAlarms(device_id: string, alarms: any) {
    await firstValueFrom( this.http.post(environment.API_URL + '/device/alarms', { device_id: device_id, alarms: alarms }) );
  }

  public async setCloudSettings(device_id: string, cloudSettings: any) {
    await firstValueFrom( this.http.post(environment.API_URL + '/device/cloudsettings', { device_id: device_id, cloud_settings: cloudSettings }) );
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

  public async activateMaintenanceMode(device_id: string, durationMinutes: number) {
    await firstValueFrom(this.http.post(environment.API_URL + "/device/maintenancemode", { device_id: device_id, duration_minutes: durationMinutes }));
  }
}
