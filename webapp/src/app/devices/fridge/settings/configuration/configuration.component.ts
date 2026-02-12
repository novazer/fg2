import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslateService} from '@ngx-translate/core';
import {DataService} from 'src/app/services/data.service';
import {DeviceService} from 'src/app/services/devices.service';
import {calculateVpd} from "../../../../util/calculateVpd";

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
  @Input() cloudSettings: any = {};
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
  public maxDehumidifySecondsEditMode:boolean = false;
  public targetHumidityDiffEditMode:boolean = false;

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
        "float_start": this.secondsToTimeString(device_settings?.daynight?.float_start || Math.floor((new Date()).getTime() / 3600000) * 3600, true),
        "day_duration": device_settings?.daynight?.day_duration / 3600 || 24,
        "light_duration": device_settings?.daynight?.light_duration / 3600 || 12,
        "maxDehumidifySeconds": device_settings?.daynight?.maxDehumidifySeconds ?? 0,
        "targetHumidityDiff": device_settings?.daynight?.targetHumidityDiff ?? 5,
        "useLongHumidityAvg": device_settings?.daynight?.useLongHumidityAvg || false,
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
        "maintenanceOn": device_settings?.lights?.maintenanceOn || false,
      },
      "co2": {
        "target": device_settings?.co2?.target ?? 400,
        "sunsetOff": device_settings?.co2?.sunsetOff || false,
      },
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
        maxDehumidifySeconds: this.settings.daynight.maxDehumidifySeconds,
        targetHumidityDiff: this.settings.daynight.targetHumidityDiff,
        useLongHumidityAvg: this.settings.daynight.useLongHumidityAvg,
      },

      co2: {
        target: this.settings.co2.target,
        sunsetOff: this.settings.co2.sunsetOff,
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
        maintenanceOn: this.settings.lights.maintenanceOn,
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

  secondsToTimeString(time:number, withOffset = false) {
    if (withOffset) {
      time -= this.offset
    }
    let date = new Date(time * 1000)
    return date.toISOString();
  }

  getDayVpd(humidityOffset = 0): number {
    return calculateVpd(
      this.settings?.day?.temperature + this.cloudSettings?.vpdLeafTempOffsetDay,
      Math.min(this.settings?.day?.humidity + humidityOffset, 90)
    );
  }

  getNightVpd(humidityOffset = 0): number {
    return calculateVpd(
      this.settings?.night?.temperature + this.cloudSettings?.vpdLeafTempOffsetNight,
      Math.min(this.settings?.night?.humidity + humidityOffset, 90)
    );
  }

}
