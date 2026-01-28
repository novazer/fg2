import {Component, ElementRef, Input, OnDestroy, OnInit, Renderer2, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AlertController, IonModal, ToastController} from '@ionic/angular';
import {combineLatest} from 'rxjs';
import {DataService} from 'src/app/services/data.service';
import {DeviceLog, DeviceService} from 'src/app/services/devices.service';
import TimeAgo from 'javascript-time-ago'

// English.
import en from 'javascript-time-ago/locale/en'
import {msToDuration} from "../settings/settings.component";

TimeAgo.addDefaultLocale(en)
// Create formatter (English).
const timeAgo = new TimeAgo('en-US')

@Component({
  selector: 'fridge-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class FridgeOverviewComponent implements OnInit, OnDestroy {

  public vpd:number = 0;
  @Input() device_id:string = "";
  @Input() device_name:string = "";
  @Input() maintenance_mode_until:number = 0;
  @Input() cloud_settings:any = {};
  @ViewChild("nameedit", { read: ElementRef }) private nameInput: ElementRef | undefined;
  @ViewChild(IonModal) modal!: IonModal;

  public logs: (DeviceLog & { count: number })[] = [];
  public t_l:number = NaN;
  public t_h:number = NaN;
  public r_l:number = NaN;
  public r_h:number = NaN;
  public co2_l:number = NaN;
  public co2_h:number = NaN;
  public vpd_l:number = NaN;
  public vpd_h:number = NaN;
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
  public workmode:string = 'off';
  public recipe:any = null;
  private refreshLogsTimer: NodeJS.Timeout|undefined = undefined;

  // timer used to refresh remaining time every second
  private timerId: any = null;
  private tick = 0;

  public deviceImageUrl: string | undefined = '';

  constructor(private devices: DeviceService, public data: DataService, private route: ActivatedRoute, private renderer: Renderer2, private alertController: AlertController, private toastController: ToastController) { }

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

    // Load recipe if any
    this.recipe = await this.devices.getRecipe(this.device_id);

    // Load device image
    void this.loadDeviceImage();

    // Load logs
    this.logs = await this.loadLogs();
    for(let log of this.logs) {
      log.time = timeAgo.format(new Date(log.time))
    }
    this.refreshLogsTimer = setInterval(async() => {
      this.logs = await this.loadLogs();
      for(let log of this.logs) {
        log.time = timeAgo.format(new Date(log.time))
      }
      this.has_logs = this.logs.length > 0;
      this.severity = Math.max(...this.logs.map((o: { severity: number; }) => {return isNaN(o.severity) ? 0 : o.severity}))

      this.recipe = await this.devices.getRecipe(this.device_id);

      void this.loadDeviceImage();
    }, 30000);

    // Load device configuration (settings page values)
    const rawConfig = await this.devices.getConfig(this.device_id);
    this.config = this.normalizeConfig(rawConfig);
    this.updateTargets();

    // Listen for settings updates saved from the Settings page and refresh targets immediately
    this.devices.settingsChanged.subscribe(({ device_id, settings }) => {
      if (device_id === this.device_id) {
        this.config = this.normalizeConfig(settings);
        this.updateTargets();
      }
    });

    if(this.logs.length) {
      this.has_logs = true;
    }
    else {
      this.has_logs = false;
    }
    this.severity = Math.max(...this.logs.map((o: { severity: number; }) => {return isNaN(o.severity) ? 0 : o.severity}))

    this.timerId = setInterval(() => {
      if (this.recipe?.activeSince > 0) {
        this.tick = Date.now(); // trigger change detection / getter recalculation
      }
    }, 1000);
  }

  async loadLogs(): Promise<(DeviceLog & { count: number })[]> {
    const newLogs = await this.devices.getLogs(this.device_id);

    const result = [];
    let count = 0;
    for (let i = 0; i < newLogs.length - 1; i++) {
      const curLog = newLogs[i];
      const nextLog = newLogs[i + 1];
      if (curLog.message !== nextLog.message || curLog.severity !== nextLog.severity || curLog.title !== nextLog.title || curLog.raw !== nextLog.raw) {
        result.push({
          ...curLog,
          count,
        });
        count = 1;
      } else {
        count++;
      }
    }

    return result;
  }

  ngOnDestroy() {
    clearInterval(this.refreshLogsTimer);
    clearInterval(this.timerId);
  }

  unClaimDevice(id:string) {
    if(confirm("Are you sure you want to remove this device?")) {
      this.devices.unclaim(id)
    }
  }

  showLogs() {
    console.log(this.showDeviceLog)
    this.showDeviceLog = true;
  }

  clearLogs() {
    this.devices.clearLogs(this.device_id);
    this.logs = [];
    this.has_logs = false;
  }

  async loadDeviceImage() {
    if (this.cloud_settings?.rtspStream) {
      this.deviceImageUrl = await this.devices.getDeviceImageUrl(this.device_id, 'jpeg');
    }
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

    // keep current workmode around for the UI label and masking rules
    const mode:string = (cfg?.workmode || 'off') + '';
    this.workmode = mode;

    let t = this.is_day ? toNum(day.temperature) : toNum(night.temperature);
    let r = this.is_day ? toNum(day.humidity) : toNum(night.humidity);
    let c = toNum(co2.target);

    // Apply visibility rules per requested modes
    switch(mode) {
      case 'off':
        t = NaN; r = NaN; c = NaN; // no targets
        break;
      case 'breed': // Keimung
        r = NaN; c = NaN; // only temperature target
        break;
      case 'temp': // Gewächshaus
        r = NaN; // only temperature and CO2 targets
        break;
      default:
        // other modes unchanged
        break;
    }

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

  getRecipeStepRemainingMs(step: any): number {
    const elapsedMs = Date.now() - this.recipe.activeSince;

    const stepDurationMs = step.duration * 60 * 1000 * (
      step.durationUnit === 'weeks'
        ? 24 * 7 * 60
        : step.durationUnit === 'days'
          ? 24 * 60
          : step.durationUnit === 'hours'
            ? 60
            : 1
    );

    return stepDurationMs - elapsedMs;
  }

  getRecipeStepRemainingDuration(step: any): string {
    return msToDuration(this.getRecipeStepRemainingMs(step)) + (step.waitForConfirmation ? ' +confirm' : '');
  }

  getMaintenanceModeRemainingMs(): number {
    if (!this.maintenance_mode_until || this.maintenance_mode_until <= 0) {
      return 0;
    }

    return this.maintenance_mode_until - Date.now();
  }

  getMaintenanceModeRemainingDuration(): string {
    return msToDuration(this.getMaintenanceModeRemainingMs());
  }

  getRecipeConfirmationMessage(step: any): string | undefined {
    if (this.getRecipeStepRemainingMs(step) <= 0 && this.recipe.steps[this.recipe.activeStepIndex].waitForConfirmation) {
      if (this.recipe.steps[this.recipe.activeStepIndex].confirmationMessage) {
        return this.recipe.steps[this.recipe.activeStepIndex].confirmationMessage;
      }

      return "Waiting for confirmation...";
    }

    return undefined;
  }

  async maintenanceMode() {
    const alert = await this.alertController.create({
      header: `Maintenance mode`,
      inputs: [
        { label: 'deactivate', type: 'radio', value: 0, checked: true },
        // @ts-ignore
        ...[...Array(24).keys()].map(i => ({ label: `${(i + 1) * 5} minutes`, type: 'radio', value: (i + 1) * 5 })),
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            try {
              await this.devices.activateMaintenanceMode(this.device_id, data);
              const toast = await this.toastController.create({ message: `Maintenance mode ${data <= 0 ? 'de' : ''}activated`, duration: 5000 });
              await toast.present();
              this.maintenance_mode_until = data <= 0 ? 0 : Date.now() + data * 60 * 1000;
              return true;
            } catch (e: any) {
              let message = 'Failed to activate maintenance mode: ' + e.message;
              console.log(message, e);
              const toast = await this.toastController.create({ message, duration: 5000 });
              await toast.present();
              return false; // close alert
            }

          }
        }
      ]
    });
    await alert.present();
  }
}
