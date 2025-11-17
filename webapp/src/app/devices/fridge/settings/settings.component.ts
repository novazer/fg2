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
  selector: 'fridge-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class FridgeSettingComponent implements OnInit {
  @Input() device_id:string = "";
  public settings:any = null
  public alarms:any = null;
  public firmwareSettings:any = null;
  public availableSensorTypes = ['temperature','humidity','co2'];
  public activePreset:any = null;
  public daybreak:any = null;
  public nightfall:any = null;
  public offset:number;

  public has_daycycle:boolean = false;
  public has_humidity:boolean = false;
  public has_co2:boolean = false;

  // Edit mode for slider fields
  public dayTempEditMode:boolean = false;
  public dayHumidityEditMode:boolean = false;
  public nightTempEditMode:boolean = false;
  public nightHumidityEditMode:boolean = false;
  public co2EditMode:boolean = false;
  public sunriseEditMode:boolean = false;
  public sunsetEditMode:boolean = false;
  public maxLightEditMode:boolean = false;
  public internalFanEditMode:boolean = false;
  public externalFanEditMode:boolean = false;

  public changeWorkmode() {
    switch(this.settings.workmode) {
      case 'exp':
        this.has_daycycle = true;
        this.has_humidity = true;
        this.has_co2 = true;
        break;
      case 'full':
      case 'small':
        this.has_daycycle = true;
        this.has_humidity = true;
        this.has_co2 = true;
        break;
      case 'temp':
        this.has_daycycle = true;
        this.has_humidity = false;
        this.has_co2 = true;
        break;
      case 'dry':
        this.has_daycycle = false;
        this.has_humidity = true;
        this.has_co2 = false;
        break;
      case 'breed':
      case 'off':
        this.has_daycycle = false;
        this.has_humidity = false;
        this.has_co2 = false;
        break;
    }
  }


  public limits = {
    temperature:       {min: 5, max: 40},
    humidity:   {min: 10, max: 90},
    co2:        {min: 100, max: 10000},
  };

  public hysteresis = {
    temperature: 1,
    humidity:    5,
    co2:         100,
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
    let device_settings;
    try {
      device_settings = JSON.parse(await this.devices.getConfig(this.device_id));

      this.daybreak = this.secondsToTimeString(device_settings.daynight.day),
      this.nightfall = this.secondsToTimeString(device_settings.daynight.night)

      this.settings = {
        "workmode" : device_settings.workmode,
        "daynight": {
          "floating": device_settings.daynight?.floating || false,
          "float_start": this.secondsToTimeString(device_settings.daynight?.float_start || Math.floor((new Date()).getTime() / 3600000) * 3600),
          "day_duration": device_settings.daynight?.day_duration / 3600 || 24,
          "light_duration": device_settings.daynight?.light_duration / 3600 || 12,
        },
        "day": {
          "humidity": device_settings.day.humidity,
          "temperature": device_settings.day.temperature
        },
        "night": {
          "humidity": device_settings.night.humidity,
          "temperature": device_settings.night.temperature
        },
        "lights": {
          "sunrise": device_settings.lights.sunrise,
          "sunset": device_settings.lights.sunset,
          "limit": device_settings.lights.limit,
        },
        "co2": device_settings.co2.target,
        "internalfan": device_settings.fans?.internal == null ? 100 : device_settings.fans?.internal,
        "externalfan": device_settings.fans?.external == null ? 100 : device_settings.fans?.external,
      }

      try {
        this.alarms = await this.devices.getAlarms(this.device_id);
      } catch (err) {
        console.warn('Alarms endpoint unavailable, continuing without alarms.', err);
      }

      try {
        this.firmwareSettings = await this.devices.getFirmwareSettings(this.device_id);
      } catch (err) {
        console.warn('Firmware settings endpoint unavailable, continuing without firmware settings.', err);
      }

      console.log(device_settings.daynight.float_start)
      console.log(this.settings.daynight.float_start)
    }
    catch(error) {
      console.log("error parsing current device settings")
      console.log(error)
      this.daybreak = this.secondsToTimeString(36000)
      this.nightfall = this.secondsToTimeString(79200)
      this.settings = {
        "workmode": 'off',
        "daynight": {
          "floating": false,
          "float_start": Math.floor((new Date()).getTime() / 3600000) * 3600,
          "day_duration": 24,
          "light_duration": 12,
        },
        "day": {
          "temperature": 25,
          "humidity": 60
        },
        "night": {
          "temperature": 25,
          "humidity": 60
        },
        "lights": {
          "sunrise": 0,
          "sunset": 0,
          "limit": 100
        },
        "co2": 400,
        "fridge_mode": 1,
        "internalfan": 100,
        "externalfan": 100,
      }
      this.alarms = [];
    }

    this.workmodes = [
      { value : "breed", name: this.translate.instant('devices.fridge.workmode-breed') },
      { value : "temp", name: this.translate.instant('devices.fridge.workmode-temp') },
      { value : "small", name: this.translate.instant('devices.fridge.workmode-small') },
      { value : "full", name: this.translate.instant('devices.fridge.workmode-default') },
      { value : "dry", name: this.translate.instant('devices.fridge.workmode-dry') },
      { value : "off", name: this.translate.instant('devices.fridge.workmode-off') }
    ]

    this.changeWorkmode();

    // console.log(this.settings)

    // for (let preset of this.presets) {
    //   this.translate.get(`settings.climate.presets.${preset.id}.name`).subscribe((txt) => { preset.name = txt; });
    //   this.translate.get(`settings.climate.presets.${preset.id}.description`).subscribe((txt) => { preset.description = txt; });
    // }

  }
  applyPreset(preset:any) {

  }

  selectCustomPreset() {

  }

  async saveSettings() {

    // console.log(this.daybreak)
    // console.log(this.nightfall)

    // console.log("SAVING DAY", this.timeStringToSeconds(this.daybreak))
    // console.log("SAVING NIGHT", this.timeStringToSeconds(this.nightfall))

    let device_settings = {
      workmode: this.settings.workmode,

      daynight: {
        day: this.timeStringToSeconds(this.daybreak),
        night: this.timeStringToSeconds(this.nightfall),
        floating: this.settings.daynight.floating,
        float_start: this.dateTimeStringToSeconds(this.settings.daynight.float_start),
        day_duration: this.settings.daynight.day_duration * 3600,
        light_duration: this.settings.daynight.light_duration * 3600,
      },

      co2: {
        target: this.settings.co2
      },

      day: {
        temperature: this.settings.day.temperature,
        humidity: this.settings.day.humidity,
      },

      night: {
        temperature: this.settings.night.temperature,
        humidity: this.settings.night.humidity,
      },

      lights: {
        sunrise: this.settings.lights.sunrise,
        sunset: this.settings.lights.sunset,
        limit: this.settings.lights.limit,
      },

      fans: {
        external: this.settings.externalfan,
        internal: this.settings.internalfan,
      }
    }

    this.saving = true;
    await this.devices.setSettings(this.device_id, JSON.stringify(device_settings))
    if (Array.isArray(this.alarms)) {
      try {
        await this.devices.setAlarms(this.device_id, this.alarms)
      } catch (err) {
        console.warn('Alarms endpoint unavailable, skipping alarm save.', err);
      }
    }
    if (typeof this.firmwareSettings === 'object') {
      try {
        await this.devices.setFirmwareSettings(this.device_id, this.firmwareSettings);
      } catch (err) {
        console.warn('Firmware settings endpoint unavailable, skipping firmware settings save.', err);
      }
    }
    this.saved = true;
    setTimeout(() => {
      this.saving = false;
    }, 500);

    return this._router.navigateByUrl('/list');
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

  dateTimeStringToSeconds(time:string) {
    time = time?.toString()?.substring(0, 19)
    // let date = parseISO(time);
    let date = new Date(time)
    return date.getTime() / 1000
  }

  compareMode(a: any, b: any) {
    return ''+a == ''+b;
  }

  secondsToTimeString(time:number) {
    time -= this.offset
    let date = new Date(time * 1000)
    return date.toISOString();
  }

  addAlarm() {
    const newAlarm = {
      sensorType: this.availableSensorTypes[0], // Default to the first sensor type
      upperThreshold: null,
      lowerThreshold: null,
      actionType: 'info', // Default action type
      actionTarget: '',
      cooldownSeconds: 600,
      name: 'My Alarm',
      additionalInfo: true,
    };
    this.alarms = [newAlarm, ...(this.alarms || [])];
  }

  removeAlarm(alarm: any) {
    const index = this.alarms.indexOf(alarm);
    if (index > -1) {
      this.alarms.splice(index, 1);
    }
  }

  toggleAlarm(alarm: any) {
    alarm.disabled = !alarm.disabled;
  }
}
