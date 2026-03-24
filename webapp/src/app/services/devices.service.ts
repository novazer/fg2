import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from '../auth/auth.service';
import type {
  CloudSettings,
  DiaryEntryData,
  DeviceAccessInfo,
  DeviceLog,
  DeviceClass,
  Recipe,
  Device,
} from '@fg2/shared-types';

export type DeviceWithParsedSettings = Device & {
  settings?: any;
};

export const device_types = ['climatesensor', 'climatesensorpro'];


@Injectable({
  providedIn: 'root'
})
export class DeviceAdminService {

  private created_devices : DeviceWithParsedSettings[] = [];
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
        name,
        description,
        concurrent: parseInt(concurrent + ''),
        maxfails: parseInt(maxfails + ''),
        firmware_id,
        beta_firmware_id: firmware_id,
      }
    ))
    return device_class;
  }

  public async updateClass(class_id: string, name:string, description: string, concurrent: number, maxfails: number, firmware_id:string, beta_firmware_id:string) {
    let device_class = await firstValueFrom( this.http.post<DeviceClass>(
      environment.API_URL + '/device/class/' + class_id,
      {
        name,
        description,
        concurrent: parseInt(concurrent + ''),
        maxfails: parseInt(maxfails + ''),
        firmware_id,
        beta_firmware_id,
      }
    ) )
    return device_class;
  }

  public async deleteFirmware(firmware_id:string) {
    return await firstValueFrom( this.http.delete(environment.API_URL + '/device/firmware/' + firmware_id) )
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

  public devices: BehaviorSubject<DeviceWithParsedSettings[]> = new BehaviorSubject<DeviceWithParsedSettings[]>([]);

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
      const devices = await firstValueFrom(this.http.get<DeviceWithParsedSettings[]>(environment.API_URL + '/device'))
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
    await firstValueFrom( this.http.post<DeviceWithParsedSettings>(environment.API_URL + '/device', {claim_code: claim_code}) )
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

  public async getCloudSettings(device_id:string): Promise<CloudSettings> {
    return (await this.getDeviceAccessInfo(device_id)).cloudSettings;
  }

  public async getDeviceAccessInfo(device_id: string): Promise<DeviceAccessInfo> {
    return await firstValueFrom(this.http.get<DeviceAccessInfo>(environment.API_URL + '/device/cloudsettings/' + device_id));
  }

  public async resolveDeviceAccessInfo(device_id: string): Promise<DeviceAccessInfo> {
    const ownedDevice = this.devices.getValue().find(device => device.device_id === device_id);

    if (ownedDevice) {
      return {
        device_id: ownedDevice.device_id,
        device_type: ownedDevice.device_type,
        name: ownedDevice.name,
        isPublic: false,
        cloudSettings: ownedDevice.cloudSettings ?? {},
      };
    }

    return this.getDeviceAccessInfo(device_id);
  }

  public async getRecipe(device_id:string): Promise<Recipe | null> {
    // returns the recipe object
    return await firstValueFrom( this.http.get<Recipe | null>(environment.API_URL + '/device/recipe/' + device_id) )
  }

  public async setRecipe(device_id:string, recipe: Recipe) {
    const payload = { device_id, recipe };
    await firstValueFrom( this.http.post(environment.API_URL + '/device/recipe', payload) );
  }

  public async getLogs(device_id:string, timestampFrom?: number, timestampTo?: number, deleted?: boolean, categories?: string[]): Promise<DeviceLog[]> {
    const result = await firstValueFrom( this.http.get<DeviceLog[]>(environment.API_URL + '/device/logs/' + device_id + '?from=' + (Number(timestampFrom ?? 0) || '') + '&to=' + (Number(timestampTo ?? 0) || '') + '&deleted=' + (deleted ? '1' : '') + (categories ? '&categories=' + categories.join(',') : '')) );
    return result?.map(log => ({ ...log, time: new Date(log.time) })) ?? [];
  }

  public async getDeviceImageUrl(device_id: string, format: 'mp4' | 'jpeg' | 'user/jpeg', timestamp?: number, duration?: string, imageId?: string): Promise<string> {
    const token = await this.auth.getImageToken();
    const tokenQuery = token ? `&token=${token}` : '';
    return `${environment.API_URL}/image/${device_id}?timestamp=${timestamp ?? (imageId ? '' : (Math.ceil(Date.now()/5000)*5000))}${tokenQuery}&format=${format}&duration=${duration ?? ''}&image_id=${imageId ?? ''}`;
  }

  public async uploadDeviceImage(device_id: string, file: File, timestamp?: number): Promise<string> {
    const formData = new FormData();
    formData.append('image', file, file.name);
    if (Number.isFinite(timestamp)) {
      formData.append('timestamp', String(timestamp));
    }

    const result = await firstValueFrom(
      this.http.post<{ image_id: string }>(environment.API_URL + '/image/' + device_id, formData)
    );
    return result.image_id;
  }

  public async clearLogs(device_id:string) {
    return await firstValueFrom( this.http.delete(environment.API_URL + '/device/logs/' + device_id) )
  }

  public async addLog(device_id: string, message: { title: string; message?: string; raw?: boolean; severity: 0 | 1 | 2 | number; categories: string[]; data?: Partial<DiaryEntryData>; images?: string[]; }) {
    await firstValueFrom( this.http.post(environment.API_URL + '/device/logs/' + device_id, message ) )
  }

  public async updateLog(device_id: string, log_id: string, payload: { title: string; message?: string; raw?: boolean; severity: 0 | 1 | 2 | number; categories: string[]; time?: Date; data?: Partial<DiaryEntryData>; images?: string[]; deleted?: boolean }) {
    await firstValueFrom(this.http.put(environment.API_URL + '/device/logs/' + device_id + '/' + log_id, payload));
  }

  public async deleteLog(device_id: string, log_id: string) {
    await firstValueFrom(this.http.delete(environment.API_URL + '/device/logs/' + device_id + '/' + log_id));
  }

  public async setSettings(device_id:string, settings: string) {
    await firstValueFrom(this.http.post<DeviceWithParsedSettings>(environment.API_URL + '/device/configure', { device_id: device_id, configuration: settings }));
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
    await firstValueFrom( this.http.post<DeviceWithParsedSettings>(environment.API_URL + '/device/setname', {device_id: device_id, name: name}) )
  }

  public async testOutputs(device_id: string, outputs:{heater:number, dehumidifier:number, co2:number, lights:number}) {
    await firstValueFrom(this.http.post(environment.API_URL + "/device/test/" + device_id, outputs));
  }

  public async stopTest(device_id: string) {
    await firstValueFrom(this.http.delete(environment.API_URL + "/device/test/" + device_id));
  }

  public async getBySerial(serialnumber: string) : Promise<DeviceWithParsedSettings> {
    const device = await firstValueFrom(this.http.get<DeviceWithParsedSettings>(environment.API_URL + "/device/byserial", {params: {serialnumber: serialnumber}}));
    try {
      device.settings = device.configuration ? JSON.parse(device.configuration) : {};
    } catch(err) {
      device.settings = {};
    }
    return device;
  }

  public async activateMaintenanceMode(device_id: string, durationMinutes: number) {
    await firstValueFrom(this.http.post(environment.API_URL + "/device/maintenancemode", { device_id: device_id, duration_minutes: durationMinutes }));
  }
}
