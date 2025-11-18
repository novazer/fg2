import {Component, Input, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {DataService} from 'src/app/services/data.service';
import {DeviceService} from 'src/app/services/devices.service';
import {ToastController} from "@ionic/angular";

@Component({
  selector: 'fridge-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class FridgeSettingComponent implements OnInit, OnDestroy {
  @Input() device_id:string = "";
  public deviceSettings: any = {};
  public alarms:any = [];
  public firmwareSettings:any = {};
  public availableSensorTypes = ['temperature','humidity','co2'];
  public offset:number;
  public settingsmode: 'manual' | 'recipe' = 'manual';
  public recipe:any = { steps: [] };

  // constants for conversion
  private readonly HOURS_IN_DAY = 24;
  private readonly HOURS_IN_WEEK = 24 * 7;

  // timer used to refresh remaining time every second
  private timerId: any = null;
  private tick = 0;

  public errorLoading:boolean = false;

  public errorSaving:boolean = false;
  public settingsOpened:boolean = false;

  public saving = false;

  public saved = false;
  constructor(
    private devices: DeviceService,
    public data: DataService,
    private route: ActivatedRoute,
    private _router: Router,
    private toastController: ToastController,
  ) {
    this.offset = new Date().getTimezoneOffset()*60;
  }

  async ngOnInit() {
    try {
      this.alarms = await this.devices.getAlarms(this.device_id);
      this.firmwareSettings = await this.devices.getFirmwareSettings(this.device_id);
      this.deviceSettings = JSON.parse(await this.devices.getConfig(this.device_id));
      this.recipe = await this.devices.getRecipe(this.device_id);

      if (this.recipe.activeSince > 0) {
        this.startTimer();
        this.settingsmode = 'recipe';
      }
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
      if (this.settingsmode === 'manual') {
        await this.devices.setSettings(this.device_id, JSON.stringify(this.deviceSettings));
      } else if (this.settingsmode === 'recipe') {
        await this.devices.setRecipe(this.device_id, {
          ...this.recipe,
          steps: this.recipe.steps.map((step: any) => ({
            ...step,
            settings: JSON.stringify(step.settings),
          })),
        });
      }
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

  onSettingsModeChange() {
    if (this.settingsmode === 'recipe') {
      if (this.recipe.steps.length === 0) {
        this.addRecipeStep();
      }
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

  addRecipeStep() {
    this.recipe.steps.push({
      settings: JSON.parse(JSON.stringify(this.recipe.steps[0]?.settings ?? this.deviceSettings)),
      durationUnit: 'days',
      duration: 7,
      waitForConfirmation: false,
    });
  }

  removeRecipeStep(step: any) {
    const index = this.recipe.steps.indexOf(step);
    if (index > -1) {
      this.recipe.steps.splice(index, 1);
    }

    if (this.recipe.activeStepIndex >= this.recipe.steps.length) {
      this.recipe.activeStepIndex = this.recipe.steps.length - 1;
    }
  }

  moveRecipeStep(index: number, direction: number) {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < this.recipe.steps.length) {
      const step = this.recipe.steps.splice(index, 1)[0];
      this.recipe.steps.splice(newIndex, 0, step);
    }

    if (this.recipe.activeStepIndex === index) {
      this.recipe.activeStepIndex = newIndex;
    } else if (this.recipe.activeStepIndex === newIndex) {
      this.recipe.activeStepIndex = index;
    }
  }

  private async showSavingReminderToast() {
    const toast = await this.toastController.create({
      message: 'Remember to save your changes!',
      duration: 5000,
      position: 'top',
    });
    await toast.present();
  }

  getActiveSinceISO(): string | null {
    const s = this.recipe?.activeSince ?? 0;
    if (!s || s <= 0) {
      return null;
    }
    try {
      return new Date(s).toISOString();
    } catch {
      return null;
    }
  }

  private startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      if (!this.settingsOpened) {
        this.tick = Date.now(); // trigger change detection / getter recalculation
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  onRecipeStepOpened(event: any) {
    if (event?.target?.nodeName === 'ION-ACCORDION-GROUP') {
      this.settingsOpened = false;
    }
  }

  // New: mark a step as running (set activeStepIndex and activeSince)
  setRunning(running: boolean) {
    if (running) {
      this.recipe.activeSince = Date.now();
      this.startTimer();
    } else {
      this.recipe.activeSince = 0;
      this.stopTimer();
    }

    void this.showSavingReminderToast();
  }

  openSettings() {
    this.settingsOpened = true;
    this.stopTimer();
  }

  closeSettings() {
    this.settingsOpened = false;
    if (this.recipe.activeSince > 0) {
      this.startTimer();
    }
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  calculateTimeRemaining(step: any) {
    const remainingMs = this.getStepRemainingMs(step);

    if (remainingMs <= 0) {
      if (step.waitForConfirmation) {
        return 'Waiting for confirmation';
      }

      return '0s';
    }

    return this.msToDuration(remainingMs);
  }

  getStepRemainingMs(step: any): number {
    let elapsedMs = 0;
    if (this.recipe.steps.indexOf(step) === this.recipe.activeStepIndex && this.recipe.activeSince > 0) {
      elapsedMs = Date.now() - this.recipe.activeSince;
    }

    const stepDurationMs = step.duration * (
      step.durationUnit === 'weeks'
        ? this.HOURS_IN_WEEK
        : step.durationUnit === 'days'
          ? this.HOURS_IN_DAY
          : 1
    ) * 3600 * 1000;

    return stepDurationMs - elapsedMs;
  }

  stepWaitingForConfirmation(step: any): boolean {
    return this.recipe.steps.indexOf(step) === this.recipe.activeStepIndex
      && this.recipe.activeSince > 0
      && step.waitForConfirmation
      && this.getStepRemainingMs(step) <= 0;
  }

  confirmCurrentStep() {
    if (this.recipe.activeStepIndex < this.recipe.steps.length - 1) {
      this.recipe.activeStepIndex += 1;
    } else {
      this.setRunning(false);
    }

    void this.showSavingReminderToast();
  }

  msToDuration(milliSeconds: number): string {
    const parts = [
      { label: 'w', value: 604800 * 1000 }, // weeks
      { label: 'd', value: 86400 * 1000 },  // days
      { label: 'h', value: 3600 * 1000 },   // hours
      { label: 'm', value: 60 * 1000 },     // minutes
      { label: 's', value: 1000 }       // seconds
    ];

    const resultParts: string[] = [];

    let remaining = milliSeconds;
    for (const part of parts) {
      const partValue = Math.floor(remaining / part.value);
      if (partValue > 0) {
        resultParts.push(`${partValue}${part.label}`);
        remaining -= partValue * part.value;
      }
    }

    return resultParts.join(' ');
  }

  onActiveStepChanged() {
    if (this.recipe.activeSince > 0) {
      this.recipe.activeSince = Date.now();
    }

    void this.showSavingReminderToast();
  }
}
