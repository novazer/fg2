import {Component, Input, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {DataService} from 'src/app/services/data.service';
import {DeviceService} from 'src/app/services/devices.service';
import {ToastController, AlertController, AlertInput} from "@ionic/angular";
import { RecipeService } from 'src/app/services/recipe.service';

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
    private alertController: AlertController,
    private recipes: RecipeService,
  ) {
    this.offset = new Date().getTimezoneOffset()*60;
  }

  async ngOnInit() {
    try {
      this.alarms = await this.devices.getAlarms(this.device_id);
      this.firmwareSettings = await this.devices.getFirmwareSettings(this.device_id);
      this.deviceSettings = JSON.parse(await this.devices.getConfig(this.device_id));
      this.recipe = await this.devices.getRecipe(this.device_id);
      this.recipe?.steps?.forEach((step: any) => step.settings = JSON.parse(step.settings));

      if (!this?.recipe.notifications) {
        this.recipe.notifications = 'off';
      }

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
      }
      await this.devices.setRecipe(this.device_id, {
        ...this.recipe,
        activeSince: this.settingsmode === 'recipe' ? this.recipe.activeSince : 0,
        steps: this.recipe.steps.map((step: any) => ({
          ...step,
          settings: JSON.stringify(step.settings),
        })),
      });
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
    const lastStep = this.recipe.steps.length > 0 ? this.recipe.steps[this.recipe.steps.length - 1] : undefined;

    this.recipe.steps.push({
      settings: JSON.parse(JSON.stringify(lastStep?.settings ?? this.deviceSettings)),
      durationUnit: 'days',
      duration: 7,
      waitForConfirmation: false,
      notifications: 'off',
    });

    if (this.recipe.activeStepIndex < 0) {
      this.recipe.activeStepIndex = 0;
    }
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

  parseWorkmode(workmode: string): { hasDaycycle: boolean, hasHumidity: boolean, hasCo2: boolean } {
    switch(workmode) {
      case 'exp':
      case 'full':
      case 'small':
        return { hasDaycycle: true, hasHumidity: true, hasCo2: true };
      case 'temp':
        return { hasDaycycle: true, hasHumidity: false, hasCo2: true };
      case 'dry':
        return { hasDaycycle: false, hasHumidity: true, hasCo2: false };
      case 'breed':
      case 'off':
      default:
        return { hasDaycycle: false, hasHumidity: false, hasCo2: false };
    }
  }

  stepWaitingForConfirmation(step: any): boolean {
    return this.recipe.steps.indexOf(step) === this.recipe.activeStepIndex
      && this.recipe.activeSince > 0
      && step.waitForConfirmation
      && this.getStepRemainingMs(step) <= 0;
  }

  getRecipeRemainingTimeMs(lastStepIndex?: number): number {
    if (this.recipe.steps.length === 0) {
      return 0;
    }

    let remainingMs = 0;

    for (let i = this.recipe.activeStepIndex; i <= (lastStepIndex ?? this.recipe.steps.length - 1); i++) {
      const step = this.recipe.steps[i];
      remainingMs += this.getStepRemainingMs(step);
    }

    return remainingMs;
  }

  getRecipeEtaTimeIso(lastStepIndex?: number): string | null {
    const remainingMs = this.getRecipeRemainingTimeMs(lastStepIndex);
    if (remainingMs <= 0) {
      return null;
    }

    return new Date(Date.now() + remainingMs).toISOString();
  }

  confirmCurrentStep() {
    if (this.recipe.activeStepIndex < this.recipe.steps.length - 1) {
      this.recipe.activeStepIndex += 1;
    } else if (this.recipe.loop) {
      this.recipe.activeStepIndex = 0;
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

  // Modal: list templates and allow load or delete
  async openLoadTemplateModal() {
    try {
      const templates = await this.recipes.listTemplates();
      if (!templates || templates.length === 0) {
        const toast = await this.toastController.create({ message: 'No templates available', duration: 2000 });
        await toast.present();
        return;
      }

      const inputs: AlertInput[] = templates
        .sort((a: any, b: any) => `${a.public ? 'b' : 'a'}${a.name}`.localeCompare(`${b.public ? 'b' : 'a'}${b.name}`))
        .map((t, idx) => ({
          name: 'selectedTemplate',              // required/shared name for radio group
          type: 'radio',
          label: `${t.public ? '[public] ' : ''}${t.name}`,
          value: t._id,
          checked: idx === 0,                    // default selection for the first item
        }));

      const alert = await this.alertController.create({
        header: 'Load template',
        inputs,
        cssClass: 'fullwidth',
        buttons: [
          {
            text: 'Delete',
            handler: async (selectedId: string) => {
              if (!selectedId) return;

              if (!confirm('Are you sure you want to delete this template?')) {
                return;
              }

              try {
                await this.recipes.deleteTemplate(selectedId);
                const toast = await this.toastController.create({ message: 'Template deleted', duration: 2000 });
                await toast.present();
              } catch (e) {
                let message = 'Failed to delete template';
                if ((e as any).status === 403) {
                  message = 'You do not have permission to delete this template';
                }
                const toast = await this.toastController.create({ message, duration: 2000 });
                await toast.present();
              }
            }
          },
          {
            text: 'Load (append)',
            handler: async (selectedId: string) => {
              if (!selectedId) return;
              try {
                // fetch template and apply locally, then send to device
                const tpl: any = await this.recipes.getTemplate(selectedId);
                // ensure step.settings are objects (they may be stored as JSON string)
                tpl.steps = tpl.steps.map((s: any) => ({
                  ...s,
                  settings: typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings,
                }));
                this.recipe.steps.push(...tpl.steps);
                const toast = await this.toastController.create({ message: 'Template loaded', duration: 2000 });
                await toast.present();
              } catch (e) {
                console.log('Failed loading template', e);
                const toast = await this.toastController.create({ message: 'Failed to load template', duration: 2000 });
                await toast.present();
              }
            }
          },
          {
            text: 'Load (replace)',
            handler: async (selectedId: string) => {
              if (!selectedId) return;
              try {
                // fetch template and apply locally, then send to device
                const tpl: any = await this.recipes.getTemplate(selectedId);
                // ensure step.settings are objects (they may be stored as JSON string)
                tpl.steps = tpl.steps.map((s: any) => ({
                  ...s,
                  settings: typeof s.settings === 'string' ? JSON.parse(s.settings) : s.settings,
                }));
                this.recipe.steps = tpl.steps;
                this.recipe.activeStepIndex = 0;
                this.recipe.activeSince = 0;
                this.recipe.loop = false;
                const toast = await this.toastController.create({ message: 'Template loaded', duration: 2000 });
                await toast.present();
              } catch (e) {
                console.log('Failed loading template', e);
                const toast = await this.toastController.create({ message: 'Failed to load template', duration: 2000 });
                await toast.present();
              }
            }
          },
          { text: 'Cancel', role: 'cancel' }
        ]
      });
      await alert.present();
    } catch (e) {
      console.log('Failed to open templates', e);
      const toast = await this.toastController.create({ message: 'Failed fetching templates', duration: 2000 });
      await toast.present();
    }
  }

  // Modal: save current recipe as new template
  async openSaveTemplateModal(isPublic: boolean) {
    const alert = await this.alertController.create({
      header: `Save ${isPublic ? 'public' : 'private'} template`,
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Template name' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            const name = data.name;
            if (!name) {
              const toast = await this.toastController.create({ message: 'Name required', duration: 5000 });
              await toast.present();
              return false; // keep alert open
            }
            try {
              const steps = this.recipe.steps.map((step: any) => ({
                ...step,
                settings: JSON.stringify(step.settings),
              }));
              await this.recipes.createTemplate(name, steps, isPublic);
              const toast = await this.toastController.create({ message: 'Template saved', duration: 5000 });
              await toast.present();
              return true;
            } catch (e: any) {
              let message = 'Failed to save template';
              if (e.status === 409) {
                message = 'Template name already exists';
              } else {
                console.log(message, e);
              }
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

  secondsToTimeString(totalSeconds: number, withOffset: boolean): string {
    const hours = Math.floor((totalSeconds + (withOffset ? -this.offset : 0)) / 3600);
    const minutes = Math.floor(((totalSeconds + (withOffset ? -this.offset : 0)) % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
}
