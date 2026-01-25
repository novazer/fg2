import { Component, Input, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';

interface Preset {
  id: string;
  name: string;
  icon: string;
  description: string;
  settings: any;
};


@Component({
  selector: 'fan-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class FanSettingsComponent implements OnInit {
  @Input() device_id:string = "";

  public settings:any = null
  public alarms:any = [];
  public cloudSettings:any = {};

  public activePreset:any = null;
  public daybreak:any = null;
  public nightfall:any = null;
  public offset:number;

  public saving = false;
  public saved = false;

  public co2inject:string = ""


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

      this.settings = device_settings;
      this.settings.mode_str = '' + this.settings.mode

      this.co2inject = JSON.stringify(this.settings.co2inject)
    }
    catch(error) {
      console.log("error parsing current device settings")
      console.log(error)
      this.settings = {
        "mode": "2",
        "day": {
          "humidity": 60.0,
          "temperature": 23.0,
          "max_speed": 100.0
        },
        "night": {
          "humidity": 60.0,
          "temperature": 23.0,
          "max_speed": 100.0
        },
        "min_speed": 0.0,
      }
    }


    console.log(this.settings)
  }

  dirty() {
    this.saved = false;
  }

  async revertPlugBinding() {
    let plug_settings = JSON.parse(await this.devices.getConfig(this.settings.co2inject.device_id))
    plug_settings.fan.device_id = 'none'
    await this.devices.setSettings(this.settings.co2inject.device_id, JSON.stringify(plug_settings))
    this.settings.co2inject = {}
    await this.saveSettings()
  }


  async saveSettings() {
    this.saving = true;
    let device_settings = this.settings;
    device_settings.mode = parseInt(device_settings.mode_str)

    await this.devices.setSettings(this.device_id, JSON.stringify(device_settings));
    await this.devices.setAlarms(this.device_id, this.alarms);
    await this.devices.setCloudSettings(this.device_id, this.cloudSettings);
    this.saved = true;
    await this._router.navigateByUrl('/list', { replaceUrl: true });
    await this.devices.refetchDevices();
    setTimeout(() => {
      this.saving = false;
    }, 500)
  }



  compareMode(a: any, b: any) {
    return ''+a == ''+b;
  }

}
