import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  selector: 'plug-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class PlugSettingsComponent implements OnInit {
  @Input() device_id:string = "";
  public settings:any = null
  public activePreset:any = null;
  public daybreak:any = null;
  public nightfall:any = null;
  public offset:number;

  public has_daycycle:boolean = false;
  public has_humidity:boolean = false;
  public has_co2:boolean = false;

  public fans:any
  public current_fan_id:any

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
    private translate: TranslateService
  ) {
    this.offset = new Date().getTimezoneOffset()*60;
  }

  changeWorkmode() {
    if(this.settings.workmode == 'light') {
      this.settings.usedaynight = true
    }
  }

  async ngOnInit() {

    let device_settings;
    try {
      device_settings = JSON.parse(await this.devices.getConfig(this.device_id));
      try {
        device_settings.fan = JSON.parse(device_settings.fan)
      }
      catch(e) {
        device_settings.fan = {
          "device_id": "none",
          "speed": 100
        }
      }

      this.devices.devices.subscribe((devices) => {
        this.fans = []
        this.fans = devices.filter(device => device.device_type == 'fan')
        this.fans.unshift({ device_id : "none", name: this.translate.instant('devices.plug.settings.co2.no-fan') },)
      })

      this.daybreak = this.secondsToTimeString(device_settings.daynight.day),
      this.nightfall = this.secondsToTimeString(device_settings.daynight.night)

      this.settings = {
        "workmode" : device_settings.workmode,
        "usedaynight": device_settings.usedaynight,
        "daynight": {
          "floating": device_settings.daynight?.floating || false,
          "float_start": this.secondsToTimeString(device_settings.daynight?.float_start || Math.floor((new Date()).getTime() / 3600000) * 3600 ),
          "day_duration": device_settings.daynight?.day_duration / 3600 || 24,
          "light_duration": device_settings.daynight?.light_duration / 3600 || 12,
        },
        "timer": {
          "timeframes": device_settings.timer.timeframes.map((el:any) => {return {ontime: this.secondsToTimeString(el.ontime), duration: el.duration}}) || [{ontime: this.secondsToTimeString(36000), duration: 10}]
        },
        "heater": {
          "day": {
            "on": device_settings.heater.day.on,
            "off": device_settings.heater.day.off
          },
          "night": {
            "on": device_settings.heater.night.on,
            "off": device_settings.heater.night.off
          },
        },
        "cooler": {
          "day": {
            "on": device_settings.cooler.day.on,
            "off": device_settings.cooler.day.off
          },
          "night": {
            "on": device_settings.cooler.night.on,
            "off": device_settings.cooler.night.off
          },
        },
        "humidify": {
          "day": {
            "on": device_settings.humidify.day.on,
            "off": device_settings.humidify.day.off
          },
          "night": {
            "on": device_settings.humidify.night.on,
            "off": device_settings.humidify.night.off
          },
        },
        "dehumidify": {
          "day": {
            "on": device_settings.dehumidify.day.on,
            "off": device_settings.dehumidify.day.off
          },
          "night": {
            "on": device_settings.dehumidify.night.on,
            "off": device_settings.dehumidify.night.off
          },
        },
        "co2": {
          "mode": device_settings.co2.mode || "const",
          "period": device_settings.co2.period || 60,
          "duration": device_settings.co2.duration || 10,
          "on": device_settings.co2.on || 600,
          "off": device_settings.co2.off || 1000
        },
        "fan": {
          "device_id": device_settings.fan?.device_id || "none",
          "speed": device_settings.fan?.speed || 100
        },
        "limits": {
          "overtemperature": {
            enabled: device_settings.limits?.overtemperature.enabled || false,
            limit: device_settings.limits?.overtemperature.limit || 30,
            hysteresis: device_settings.limits?.overtemperature.hysteresis || 1
          },
          "undertemperature": {
            enabled: device_settings.limits?.undertemperature.enabled || false,
            limit: device_settings.limits?.undertemperature.limit || 10,
            hysteresis: device_settings.limits?.undertemperature.hysteresis || 1
          },
          "time": {
            enabled: device_settings.limits?.time.enabled || false,
            min_on: device_settings.limits?.time.min_on || 0,
            min_off: device_settings.limits?.time.min_off || 0,
          },
        }
      }

      this.current_fan_id = device_settings.fan?.device_id || "none"
    }
    catch(error) {
      console.log("error parsing current device settings")
      console.log(error)
      this.daybreak = this.secondsToTimeString(36000)
      this.nightfall = this.secondsToTimeString(79200)
      this.settings = {
        "workmode": 'off',
        "usedaynight": false,
        "daynight": {
          "floating": false,
          "float_start": this.secondsToTimeString(Math.floor((new Date()).getTime() / 3600000) * 3600 ),
          "day_duration": 24,
          "light_duration": 12,
        },
        "timer": {
          "timeframes": [{ontime: this.secondsToTimeString(36000), duration: 10}]
        },
        "heater": {
          "day": {
            "on": 25,
            "off": 30
          },
          "night": {
            "on": 20,
            "off": 25
          },
        },
        "cooler": {
          "day": {
            "on": 30,
            "off": 25
          },
          "night": {
            "on": 25,
            "off": 20
          },
        },
        "humidify": {
          "day": {
            "on": 55,
            "off": 60
          },
          "night": {
            "on": 50,
            "off": 55
          },
        },
        "dehumidify": {
          "day": {
            "on": 60,
            "off": 55
          },
          "night": {
            "on": 55,
            "off": 50
          },
        },
        "co2": {
          "mode": "const",
          "period": 60,
          "duration": 10,
          "on": 600,
          "off": 1000
        },
        "fan": {
          "device_id": "none",
          "speed": 100
        },
        "limits": {
          "overtemperature": {
            enabled: false,
            limit: 30,
            hysteresis: 1
          },
          "undertemperature": {
            enabled: false,
            limit: 10,
            hysteresis: 1
          },
          "time": {
            enabled: false,
            min_on: 0,
            min_off: 0,
          },
        }
      }
    }

    this.workmodes = [
      { value : "off", name: this.translate.instant('devices.plug.workmode-off') },
      { value : "timer", name: this.translate.instant('devices.plug.workmode-timer') },
      { value : "heater", name: this.translate.instant('devices.plug.workmode-heater') },
      { value : "cooler", name: this.translate.instant('devices.plug.workmode-cooler') },
      { value : "humidify", name: this.translate.instant('devices.plug.workmode-humidify') },
      { value : "dehumidify", name: this.translate.instant('devices.plug.workmode-dehumidify') },
      { value : "co2", name: this.translate.instant('devices.plug.workmode-co2') },
      { value : "light", name: this.translate.instant('devices.plug.workmode-light') },
    ]

    console.log(this.settings)

  }

  filterNumbers(event: any) {
    const pattern = /[0-9.]/;
    let inputChar = String.fromCharCode(event.charCode);

    if (!pattern.test(inputChar)) {
      event.preventDefault();
    }
  }

  async updateFanSettings() {

    if(this.settings.fan.device_id != 'none') {
      if(this.settings.fan.device_id != this.current_fan_id || this.settings.workmode != 'co2' || this.settings.co2.mode == 'periodic') {
        let current_fan_settings = JSON.parse(await this.devices.getConfig(this.settings.fan.device_id))
        current_fan_settings.co2inject = {}
        console.log(current_fan_settings)
        this.devices.setSettings(this.settings.fan.device_id, JSON.stringify(current_fan_settings))
      }
    }
    if(this.settings.workmode == 'co2' && this.settings.co2.mode == 'periodic') {
      this.settings.fan.device_id = this.current_fan_id
      if(this.settings.fan.device_id != 'none') {
        let current_fan_settings = JSON.parse(await this.devices.getConfig(this.settings.fan.device_id))
        current_fan_settings.co2inject = {
          device_id: this.device_id,
          speed: this.settings.fan.speed,
          usedaynight: this.settings.usedaynight,
          day: this.settings.daynight?.day,
          night: this.settings.daynight?.night,
          period: this.settings.co2.period,
          duration: this.settings.co2.duration
        }
        console.log(current_fan_settings)
        this.devices.setSettings(this.settings.fan.device_id, JSON.stringify(current_fan_settings))
      }
    }
    else {
      this.settings.fan.device_id = 'none'
    }
  }

  async saveSettings() {

    await this.updateFanSettings()

    console.log(this.settings)

    let device_settings = {
      workmode: this.settings.workmode,
      usedaynight: this.settings.usedaynight,

      daynight: {
        day: this.timeStringToSeconds(this.daybreak),
        night: this.timeStringToSeconds(this.nightfall),
        floating: this.settings.daynight.floating,
        float_start: this.dateTimeStringToSeconds(this.settings.daynight.float_start),
        day_duration: this.settings.daynight.day_duration * 3600,
        light_duration: this.settings.daynight.light_duration * 3600,
      },

      timer: {
        timeframes: this.settings.timer.timeframes.map((el:any) => { return { ontime: this.timeStringToSeconds(el.ontime), duration: el.duration}}),
      },

      heater: {
        day: {
          on: this.settings.heater.day.on,
          off: this.settings.heater.day.off
        },
        night: {
          on: this.settings.heater.night.on,
          off: this.settings.heater.night.off
        },
      },
      cooler: {
        day: {
          on: this.settings.cooler.day.on,
          off: this.settings.cooler.day.off
        },
        night: {
          on: this.settings.cooler.night.on,
          off: this.settings.cooler.night.off
        },
      },
      humidify: {
        day: {
          on: this.settings.humidify.day.on,
          off: this.settings.humidify.day.off
        },
        night: {
          on: this.settings.humidify.night.on,
          off: this.settings.humidify.night.off
        },
      },
      dehumidify: {
        day: {
          on: this.settings.dehumidify.day.on,
          off: this.settings.dehumidify.day.off
        },
        night: {
          on: this.settings.dehumidify.night.on,
          off: this.settings.dehumidify.night.off
        },
      },
      co2: {
        mode: this.settings.co2.mode,
        period: this.settings.co2.period,
        duration: this.settings.co2.duration,
        on: this.settings.co2.on,
        off: this.settings.co2.off
      },
      "limits": {
        "overtemperature": {
          enabled: this.settings.limits.overtemperature.enabled,
          limit: this.settings.limits.overtemperature.limit,
          hysteresis: this.settings.limits.overtemperature.hysteresis
        },
        "undertemperature": {
          enabled: this.settings.limits.undertemperature.enabled,
          limit: this.settings.limits.undertemperature.limit,
          hysteresis: this.settings.limits.undertemperature.hysteresis
        },
        "time": {
          enabled: this.settings.limits.time.enabled,
          min_on: this.settings.limits.time.min_on,
          min_off: this.settings.limits.time.min_off,
        },
      },
      fan: JSON.stringify({
        device_id: this.current_fan_id,
        speed: this.settings.fan.speed
      })
    }

    this.saving = true;
    await this.devices.setSettings(this.device_id, JSON.stringify(device_settings))
    this.saved = true;
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

  dateTimeStringToSeconds(time:string) {
    time = time.substring(0, 19)
    // let date = parseISO(time);
    let date = new Date(time)
    return date.getTime() / 1000
  }
}
