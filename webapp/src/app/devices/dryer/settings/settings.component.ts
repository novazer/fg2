import { Component, Input, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';
import { formatISO, parseISO } from 'date-fns';

interface Preset {
  id: string;
  name: string;
  icon: string;
  description: string;
  settings: any;
};



@Component({
  selector: 'dryer-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class DryerSettingComponent implements OnInit {
  @Input() device_id:string = "";
  public settings:any = null
  public alarms:any = [];
  public cloudSettings:any = {};
  public activePreset:any = null;
  public daybreak:any = null;
  public nightfall:any = null;
  public offset:number;

  public current_preset:any = 0;

  public presets:any = []


  public changeWorkmode() {
  }

  public changePreset() {
    this.presets.forEach((preset:any) => {
      if(preset.id == this.current_preset) {
        this.settings.temperature = preset.temperature
        this.settings.humidity = preset.humidity
      }
    })
    this.settings.workmode = "drying"
  }


  selectCustomPreset() {
    this.current_preset = 0
    this.presets.forEach((preset:any) => {
      if(preset.id != 0 && preset.temperature == this.settings.temperature && preset.humidity == this.settings.humidity) {
        this.current_preset = preset.id
      }
    })
  }

  public limits = {
    temperature:       {min: 5, max: 40},
    humidity:   {min: 10, max: 90},
  };

  public hysteresis = {
    temperature: 1,
    humidity:    5,
  };

  public saving = false;
  public saved = false;
  public workmodes:any = null;

  constructor(
    private devices: DeviceService,
    public data: DataService,
    private route: ActivatedRoute,
    private _router: Router,
    private translate: TranslateService
  ) {
    this.offset = new Date().getTimezoneOffset()*60;
  }

  async ngOnInit() {
    // setInterval(() => {
    //   console.log("day ", this.daybreak)
    //   console.log("night ", this.nightfall)
    // },1000)
    console.log(this.device_id);
    let device_settings;
    try {
      this.alarms = await this.devices.getAlarms(this.device_id);
      this.alarms?.forEach((alarm: any) => {
        alarm.newHeaderName = '';
      });
      this.cloudSettings = await this.devices.getCloudSettings(this.device_id);

      device_settings = JSON.parse(await this.devices.getConfig(this.device_id));

      this.settings = {
        "workmode" : device_settings.workmode,
        "humidity": device_settings.humidity,
        "temperature": device_settings.temperature,
        "internalfan": device_settings.fans?.internal == null ? 100 : device_settings.fans?.internal,
        "externalfan": device_settings.fans?.external == null ? 100 : device_settings.fans?.external,
      }
    }
    catch(error) {
      console.log("error parsing current device settings")
      console.log(error)
      this.settings = {
        "workmode": 'off',
        "temperature": 25,
        "humidity": 60,
        "internalfan": 100,
        "externalfan": 100,
      }
    }

    this.workmodes = [
      { value : "dry", name: this.translate.instant('devices.fridge.workmode-dry') },
      { value : "off", name: this.translate.instant('devices.fridge.workmode-off') }
    ]

    this.presets = [
      {
        id: 0,
        name: this.translate.instant('devices.dryer.preset-none'),
      },
      {
        id: 1,
        name: this.translate.instant('devices.dryer.preset-fast'),
        temperature: 25,
        humidity: 50
      },
      {
        id: 2,
        name: this.translate.instant('devices.dryer.preset-medium'),
        temperature: 20,
        humidity: 55
      },
      {
        id: 3,
        name: this.translate.instant('devices.dryer.preset-slow'),
        temperature: 15,
        humidity: 60
      }
    ]

    this.selectCustomPreset()

  }

  async saveSettings() {

    let device_settings = {
      workmode: this.settings.workmode,

      temperature: this.settings.temperature,
      humidity: this.settings.humidity,

      fans: {
        external: this.settings.externalfan,
        internal: this.settings.internalfan,
      }
    }

    this.saving = true;
    await this.devices.setSettings(this.device_id, JSON.stringify(device_settings))
    await this.devices.setAlarms(this.device_id, this.alarms);
    await this.devices.setCloudSettings(this.device_id, this.cloudSettings);
    this.saved = true;
    await this._router.navigateByUrl('/list', { replaceUrl: true });
    await this.devices.refetchDevices();
    setTimeout(() => {
      this.saving = false;
    }, 500)


  }

  timeStringToSeconds(time:string) {
    time = time.substring(0, 19)
    // let date = parseISO(time);
    let date = new Date(time)
    let mins:number = date.getMinutes()
    let hours:number = date.getHours()
    let timestamp:number = mins * 60 + hours * 3600;

    timestamp += this.offset;
    if(timestamp<0){
      timestamp += 24*3600;
    } else if(timestamp >= 24*3600){
      timestamp -= 24*3600;
    }
    return timestamp;
  }

  compareMode(a: any, b: any) {
    return ''+a == ''+b;
  }

  secondsToTimeString(time:number) {
    time -= this.offset
    let date = new Date(time * 1000)
    return date.toISOString();
  }
}
