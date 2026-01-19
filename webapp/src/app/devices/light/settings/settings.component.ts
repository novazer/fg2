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
  selector: 'light-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class LightSettingsComponent implements OnInit {
  @Input() device_id:string = "";

  public settings:any = null;
  public alarms:any = [];
  public cloudSettings:any = {};

  public activePreset:any = null;
  public daybreak:any = null;
  public nightfall:any = null;
  public offset:number;

  public saving = false;
  public saved = false;


  public limits = {
    temperature:       {min: 5, max: 40},
    humidity:   {min: 10, max: 90},
    co2:        {min: 100, max: 10000},
  };

  public hysteresis = {
    temperature: 2,
    humidity:    10,
    co2:         100,
  };

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
    console.log(this.device_id);
    let device_settings;

    try {
      this.alarms = await this.devices.getAlarms(this.device_id);
      this.alarms?.forEach((alarm: any) => {
        alarm.newHeaderName = '';
      });
      this.cloudSettings = await this.devices.getCloudSettings(this.device_id);

      device_settings = JSON.parse(await this.devices.getConfig(this.device_id));
      console.log(device_settings);

      console.log("READING DAY ", device_settings.day)
      console.log("READING NIGHT ", device_settings.night)

      this.daybreak = this.secondsToTimeString(device_settings.day),
      this.nightfall = this.secondsToTimeString(device_settings.night)

      this.settings = {
        "max_temperature": device_settings.max_temperature,
        "sunrise": device_settings.sunrise,
        "sunset": device_settings.sunset,
        "limit": device_settings.limit,
      }
    }
    catch(error) {
      console.log("error parsing current device settings")
      console.log(error)
      this.daybreak = this.secondsToTimeString(32400),
      this.nightfall = this.secondsToTimeString(75600)
      this.settings = {
        "max_temperature": 40,
        "sunrise": 0,
        "sunset": 0,
        "limit": 100
      }
    }


    console.log(this.settings)
  }

  dirty() {
    this.saved = false;
  }


  async saveSettings() {

    console.log(this.daybreak)
    console.log(this.nightfall)

    console.log("SAVING DAY", this.timeStringToSeconds(this.daybreak))
    console.log("SAVING NIGHT", this.timeStringToSeconds(this.nightfall))

    let device_settings = {
      day: this.timeStringToSeconds(this.daybreak),
      night:this.timeStringToSeconds(this.nightfall),

      max_temperature: this.settings.max_temperature,
      sunrise: this.settings.sunrise,
      sunset: this.settings.sunset,
      limit: this.settings.limit,
    }

    this.saving = true;
    await this.devices.setSettings(this.device_id, JSON.stringify(device_settings))
    await this.devices.setAlarms(this.device_id, this.alarms);
    await this.devices.setCloudSettings(this.device_id, this.cloudSettings);
    this.saved = true;
    await this._router.navigateByUrl('/list', { replaceUrl: true });
    setTimeout(() => {
      this.saving = false;
    }, 500)
  }


  selectCustomPreset() {}

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
