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
  public deviceSettingsJson: string = '{}';
  public alarms:any = [];
  public firmwareSettings:any = {};
  public availableSensorTypes = ['temperature','humidity','co2'];
  public offset:number;

  public errorLoading:boolean = false;
  public errorSaving:boolean = false;


  public saving = false;
  public saved = false;

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
    try {
      this.deviceSettingsJson = await this.devices.getConfig(this.device_id);
      this.alarms = await this.devices.getAlarms(this.device_id);
      this.firmwareSettings = await this.devices.getFirmwareSettings(this.device_id);
    }
    catch(error) {
      console.log("error getting current device settings:", error);
      this.errorLoading = true;
    }
  }

  async saveSettings() {
    if (this.saving) {
      return;
    }

    this.saving = true;

    try {
      await this.devices.setSettings(this.device_id, this.deviceSettingsJson);
      await this.devices.setAlarms(this.device_id, this.alarms);
      await this.devices.setFirmwareSettings(this.device_id, this.firmwareSettings);
      this.saved = true;
      await this._router.navigateByUrl('/list');
    } catch(e) {
      console.log('Failed saving settings:', e);
      this.errorSaving = true;
    } finally {
      this.saving = false;
    }
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
