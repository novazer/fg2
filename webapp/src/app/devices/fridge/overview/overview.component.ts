import { Component, ElementRef, Input, OnInit, Renderer2, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { combineLatest } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';
import TimeAgo from 'javascript-time-ago'

// English.
import en from 'javascript-time-ago/locale/en'
TimeAgo.addDefaultLocale(en)
// Create formatter (English).
const timeAgo = new TimeAgo('en-US')

@Component({
  selector: 'fridge-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class FridgeOverviewComponent implements OnInit {

  public vpd:number = 0;
  @Input() device_id:string = "";
  @Input() device_name:string = "";
  @ViewChild("nameedit", { read: ElementRef }) private nameInput: ElementRef | undefined;

  public logs:any;
  public t_l:number = NaN;
  public t_h:number = NaN;
  public r_l:number = NaN;
  public r_h:number = NaN;
  public co2_l:number = NaN;
  public co2_h:number = NaN;
  public config:any;
  public has_logs:boolean = false;
  public severity:number = 0;
  public device_online = false;
  public showDeviceLog:boolean = false;
  public editingName:boolean = false;

  // Targets from Settings page
  public tempTarget:number = NaN;
  public humidityTarget:number = NaN;
  public co2Target:number = NaN;
  public is_day:boolean = false;

  constructor(private devices: DeviceService, public data: DataService, private route: ActivatedRoute, private renderer: Renderer2) { }

  editName() {
    this.editingName = true;
    this.renderer.setStyle(this.nameInput?.nativeElement, 'display', 'block')
    this.renderer.selectRootElement(this.nameInput?.nativeElement);
    this.nameInput?.nativeElement.focus()
    //this.nameInput?.nativeElement.setFocus();
  }

  doneEdit() {
    this.editingName = false;
    this.renderer.setStyle(this.nameInput?.nativeElement, 'display', 'none')
    this.devices.setName(this.device_id, this.device_name)
  }

  async ngOnInit() {
    if(this.device_name == "" || this.device_name == undefined) {
      this.device_name = "Plantalytix Fridgegrow 2.0"
    }
    // Compute VPD and online state from live measurements
    combineLatest([
      this.data.measure(this.device_id, 'temperature'),
      this.data.measure(this.device_id, 'humidity')
    ]).subscribe(([temp, rh]) => {
      var es = 0.6108 * Math.exp(17.27 * temp / (rh + 237.3));
      var ea = rh / 100.0 * es;
      this.vpd = (es - ea) * 1000;

      if(isNaN(this.vpd)) {
        this.device_online = false;
      }
      else {
        this.device_online = true;
      }
    })

    // Track lights to infer day/night for picking setpoints
    this.data.measure(this.device_id, 'out_light').subscribe((light:any) => {
      const prev = this.is_day;
      this.is_day = (light ?? 0) >= 0.5;
      if(this.is_day !== prev) {
        this.updateTargets();
      }
    })

    // Load logs
    this.logs = await this.devices.getLogs(this.device_id);
    for(let log of this.logs) {
      log.time = timeAgo.format(new Date(log.time))
    }

    // Load device configuration (settings page values)
    const rawConfig = await this.devices.getConfig(this.device_id);
    this.config = this.normalizeConfig(rawConfig);
    this.updateTargets();

    if(this.logs.length) {
      this.has_logs = true;
    }
    else {
      this.has_logs = false;
    }
    this.severity = Math.max(...this.logs.map((o: { severity: number; }) => {return isNaN(o.severity) ? 0 : o.severity}))
  }

  unClaimDevice(id:string) {
    if(confirm("Are you sure you want to remove this device?")) {
      this.devices.unclaim(id)
    }
  }

  @ViewChild(IonModal) modal!: IonModal;


  showLogs() {
    console.log(this.showDeviceLog)
    this.showDeviceLog = true;
  }

  clearLogs() {
    this.devices.clearLogs(this.device_id);
    this.logs = [];
    this.has_logs = false;
  }

  private updateTargets() {
    const toNum = (v:any): number => {
      if(v === null || v === undefined) return NaN;
      const n = typeof v === 'number' ? v : parseFloat(v);
      return isNaN(n as any) ? NaN : n;
    };

    const cfg:any = this.config || {};
    const day:any = cfg?.day || {};
    const night:any = cfg?.night || {};
    const co2:any = cfg?.co2 || {};

    const t = this.is_day ? toNum(day.temperature) : toNum(night.temperature);
    const r = this.is_day ? toNum(day.humidity) : toNum(night.humidity);
    const c = toNum(co2.target);

    this.tempTarget = t;
    this.humidityTarget = r;
    this.co2Target = c;
  }

  // Normalize configuration returned by DeviceService.getConfig so we can always access
  // properties like day.temperature, night.humidity, co2.target safely.
  private normalizeConfig(raw: any): any {
    if (!raw) return {};

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed?.settings || this.parseConfiguration(parsed) || parsed;
      } catch {
        return {};
      }
    }

    if (typeof raw === 'object') {
      return raw.settings || this.parseConfiguration(raw) || raw;
    }

    return {};
  }

  private parseConfiguration(obj: any): any {
    try {
      return obj.configuration ? JSON.parse(obj.configuration) : null;
    } catch {
      return null;
    }
  }
}
