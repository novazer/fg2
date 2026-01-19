import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";

@Component({
  selector: 'alarms',
  templateUrl: './alarms.component.html',
  styleUrls: ['./alarms.component.scss'],
})
export class AlarmsComponent {
  @Input() alarms: any;
  @Output() alarmsChange = new EventEmitter<any>();

  public availableSensorTypes = ['temperature', 'humidity', 'co2', 'co2_valve', 'light', 'dehumidifier', 'heater'];

  addAlarm() {
    const newAlarm = {
      sensorType: this.availableSensorTypes[0], // Default to the first sensor type
      upperThreshold: null,
      lowerThreshold: null,
      actionType: 'info', // Default action type
      actionTarget: '',
      cooldownSeconds: 600,
      retriggerSeconds: 3600,
      name: 'My Alarm',
      additionalInfo: true,
    };
    this.alarmsChange.emit([newAlarm, ...(this.alarms || [])]);
  }

  removeAlarm(alarm: any) {
    const index = this.alarms.indexOf(alarm);
    if (index > -1) {
      this.alarms.splice(index, 1);
    }
    this.alarmsChange.emit(this.alarms);
  }

  toggleAlarm(alarm: any) {
    alarm.disabled = !alarm.disabled;
    this.alarmsChange.emit(this.alarms);
  }

  addWebhookHeader(alarm: any) {
    alarm.webhookHeaders[alarm.newHeaderName.trim()] = '';
    alarm.newHeaderName = '';
    this.alarmsChange.emit(this.alarms);
  }

  deleteWebhookHeader(alarm: any, headerName: any) {
    delete alarm.webhookHeaders[headerName];
    this.alarmsChange.emit(this.alarms);
  }

  trackByMethod(alarm: any) {
    return (index: number, el: any): number => el.key + alarm.disabled;
  }

  castToString(obj: any): string{
    return obj as string;
  }
}
