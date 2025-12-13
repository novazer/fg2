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
export class FridgeSettingsConfigurationComponent implements OnChanges {

  @Input() deviceSettings: any = {};
  @Output() deviceSettingsChange = new EventEmitter<any>();
  public settings:any = null
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
  public nightfallEditMode:boolean = false;
  public daybreakEditMode:boolean = false;
  public floatingDayDurationEditMode:boolean = false;
  public floatingLightDurationEditMode:boolean = false;

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

  ngOnChanges(changes: SimpleChanges) {
    if ('deviceSettings' in changes) {
      this.loadSettings(changes['deviceSettings'].currentValue);
    }
  }

  private loadSettings(device_settings: any) {
    this.settings = {
      "workmode" : device_settings?.workmode ?? 'off',
      "daynight": {
        "day": this.timeSecondsToLocalSeconds(device_settings?.daynight?.day) ?? 36000,
        "night": this.timeSecondsToLocalSeconds(device_settings?.daynight?.night) ?? 79200,
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
      { value : "full", name: this.translate.instant('devices.fridge.workmode-full') },
      { value : "dry", name: this.translate.instant('devices.fridge.workmode-dry') },
      { value : "off", name: this.translate.instant('devices.fridge.workmode-off') }
    ]

    this.changeWorkmode();
  }

  onSettingsChanged() {
    let device_settings = {
      workmode: this.settings.workmode,

      daynight: {
        day: this.localSecondsToTimeSeconds(this.settings.daynight.day),
        night: this.localSecondsToTimeSeconds(this.settings.daynight.night),
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

    this.deviceSettings = device_settings;
    this.deviceSettingsChange.emit(device_settings);
  }

  localSecondsToTimeSeconds(time:number) {
    time += this.offset;
    if(time<0){
      time += 24*3600;
    } else if(time >= 24*3600){
      time -= 24*3600;
    }
    return time;
  }

  timeSecondsToLocalSeconds(time:number|unknown) {
    if (typeof time !== 'number') {
      return time;
    }

    time -= this.offset;
    if(time<0){
      time += 24*3600;
    } else if(time >= 24*3600){
      time -= 24*3600;
    }
    return time;
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
    // time -= this.offset
    let date = new Date(time * 1000)
    return date.toISOString();
  }

}
