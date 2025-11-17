import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
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
  selector: 'fridge-settings-config',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
})
export class FridgeSettingsConfigurationComponent implements OnInit, OnChanges {
  @Input() settingsJson:string = '{}';
  @Output() settingsJsonChange = new EventEmitter<string>();

  public settings:any = null
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

    this.onSettingsChanged();
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

  ngOnInit() {
    // this.loadSettings(this.settingsJson);
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('settingsJson' in changes) {
      this.loadSettings(changes['settingsJson'].currentValue);
    }
  }

  private loadSettings(settingsJson: string) {
    let device_settings;
    try {
      device_settings = JSON.parse(settingsJson);
    }
    catch(error) {
      console.log("error parsing current device settings")
      console.log(error)
    }

    this.daybreak = this.secondsToTimeString(device_settings?.daynight?.day ?? 36000);
    this.nightfall = this.secondsToTimeString(device_settings?.daynight?.night ?? 79200);

    this.settings = {
      "workmode" : device_settings?.workmode ?? 'off',
      "daynight": {
        "floating": device_settings?.daynight?.floating || false,
        "float_start": this.secondsToTimeString(device_settings?.daynight?.float_start || Math.floor((new Date()).getTime() / 3600000) * 3600),
        "day_duration": device_settings?.daynight?.day_duration / 3600 || 24,
        "light_duration": device_settings?.daynight?.light_duration / 3600 || 12,
      },
      "day": {
        "humidity": device_settings?.day?.humidity ?? 60,
        "temperature": device_settings?.day?.temperature ?? 25,
      },
      "night": {
        "humidity": device_settings?.night?.humidity ?? 60,
        "temperature": device_settings?.night?.temperature ?? 25,
      },
      "lights": {
        "sunrise": device_settings?.lights?.sunrise ?? 0,
        "sunset": device_settings?.lights?.sunset ?? 0,
        "limit": device_settings?.lights?.limit ?? 100,
      },
      "co2": device_settings?.co2?.target ?? 400,
      "internalfan": device_settings?.fans?.internal ?? 100,
      "externalfan": device_settings?.fans?.external ?? 100,
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
  }

  onSettingsChanged() {
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

    this.settingsJson = JSON.stringify(device_settings);
    this.settingsJsonChange.emit(JSON.stringify(device_settings));
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

}
