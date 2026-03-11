import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {ModalController} from '@ionic/angular';
import {DeviceService} from 'src/app/services/devices.service';
import {HttpErrorResponse} from "@angular/common/http";
import {LIFECYCLE_EVENT_ORDER} from "../grow-report/grow-report.component";

export type DiaryEntryData = {
  co2FillingRest: number;
  co2FillingInitial: number;
  newLifecycleStage: 'germination' | 'seedling' | 'vegetative' | 'flowering' | 'drying' | 'curing';
  lifecycleName: string;
  lightMeasurement: number;
  distanceMeasurement: number;
  tdsMeasurement: number;
  ecMeasurement: number;
  outsideTemperatureMeasurement: number;
  phMeasurement: number;
};

export type DiaryEntry = {
  message?: string;
  title: string;
  time: Date;
  category: string;
  data?: Partial<DiaryEntryData>,
  images?: string[];
};

export const defaultDiaryEntries : Record<string, Partial<DiaryEntry> & { defaults?: Partial<Omit<DiaryEntry, 'data'>> }> = {
  'diary-co2-refill': {
    defaults: {
      title: 'message-diary-co2-refill',
    },
    message: '',
    data: {
      co2FillingRest: 0,
      co2FillingInitial: 425,
    },
  },
  'diary-plant-log': {
    defaults: {
      title: 'message-diary-plant-log'
    },
    message: '',
  },
  'diary-fridge-log': {
    defaults: {
      title: 'message-diary-fridge-log'
    },
    message: '',
  },
  'diary-measurement': {
    defaults: {
      title: 'message-diary-measurement',
    },
    message: '',
    data: {
      lightMeasurement: undefined,
      distanceMeasurement: undefined,
      tdsMeasurement: undefined,
      ecMeasurement: undefined,
      outsideTemperatureMeasurement: undefined,
      phMeasurement: undefined,
    },
  },
  'diary-plant-lifecycle': {
    defaults: {
      title: 'message-diary-plant-lifecycle',
    },
    message: '',
    data: {
      newLifecycleStage: 'seedling',
      lifecycleName: 'My Strain',
    },
  },
};

const LOADING_PLACEHOLDER = 'loading...';

@Component({
  selector: 'app-diary-entry-modal',
  templateUrl: './diary-entry-modal.component.html',
  styleUrls: ['./diary-entry-modal.component.scss'],
})
export class DiaryEntryModalComponent implements OnInit {
  @Input() entry: DiaryEntry | undefined;
  @Input() deviceId: string | undefined;


  @ViewChild('cameraInput') cameraInput? : ElementRef;
  @ViewChild('filesInput') filesInput? : ElementRef;

  public message = '';
  public title = ''
  // Keep ion-datetime value in local wall-time format (without timezone suffix).
  public time = DiaryEntryModalComponent.toLocalDateTimeInputValue(new Date());
  public category = 'diary-plant-log';
  public data: {[K in keyof DiaryEntryData]?: DiaryEntryData[K] | undefined} = {};
  public images: string[] = [];
  public uploading = false;
  public uploadErrors: string[] = [];
  public fixedLifecycleName: string | undefined = undefined;

  public imageIdToImageUrl: Record<string, string> = {};

  constructor(private modalController: ModalController, private devices: DeviceService) {
  }

  ngOnInit() {
    this.message = this.entry?.message || '';
    this.title = this.entry?.title || '';
    this.time = DiaryEntryModalComponent.toLocalDateTimeInputValue(this.entry?.time ?? new Date());
    this.category = this.entry?.category || 'diary-plant-log';
    this.data = {
      co2FillingRest: this.entry?.data?.co2FillingRest || 0,
      co2FillingInitial: this.entry?.data?.co2FillingInitial || 425,
      lifecycleName: this.entry?.data?.lifecycleName ?? 'My Strain',
      ...(this.entry?.data ?? {}),
    },
    this.images = this.entry?.images ? this.entry.images : [];
    void this.loadImageUrls();
    void this.checkFixedLifecycleName();
  }

  async checkFixedLifecycleName() {
    this.fixedLifecycleName = LOADING_PLACEHOLDER;

    if (!this.deviceId) {
      return;
    }

    if (this.category === 'diary-plant-lifecycle') {
      if (this.data.newLifecycleStage) {
        const lifecycleLogs = await this.devices.getLogs(this.deviceId, undefined, new Date(this.time).getTime(), true, ['diary-plant-lifecycle']);

        let lifecycleOrder = LIFECYCLE_EVENT_ORDER[this.data.newLifecycleStage];
        for (const log of lifecycleLogs.reverse()) {
          const currentLifecycleOrder = log.data?.newLifecycleStage ? LIFECYCLE_EVENT_ORDER[log.data.newLifecycleStage] : Number.MAX_SAFE_INTEGER;

          if (currentLifecycleOrder < lifecycleOrder) {
            lifecycleOrder = currentLifecycleOrder;
            this.fixedLifecycleName = log.data?.lifecycleName || this.fixedLifecycleName;
          } else {
            break;
          }
        }
      }
    } else {
      const lifecycleLogs = await this.devices.getLogs(this.deviceId, undefined, new Date(this.time).getTime(), true, ['diary-plant-lifecycle']);

      if (!this.data.newLifecycleStage) {
        const previousLifecycleStage = lifecycleLogs.reverse().find(l => l.data?.newLifecycleStage);
        if (previousLifecycleStage?.data?.newLifecycleStage && previousLifecycleStage?.data?.newLifecycleStage in LIFECYCLE_EVENT_ORDER) {
          const previousLifecycleOrder = LIFECYCLE_EVENT_ORDER[previousLifecycleStage.data.newLifecycleStage] ?? -1;
          const nextLifecycleOrder = (previousLifecycleOrder + 1) % Object.keys(LIFECYCLE_EVENT_ORDER).length;
          const nextLifecycleStage = Object.entries(LIFECYCLE_EVENT_ORDER).find(([key, order]) => order === nextLifecycleOrder)?.[0];

          if (nextLifecycleStage) {
            this.data.newLifecycleStage = nextLifecycleStage as DiaryEntryData['newLifecycleStage'];
          }
        }
      }
    }

    if (this.fixedLifecycleName === LOADING_PLACEHOLDER) {
      this.fixedLifecycleName = undefined;
    }
  }

  cancel() {
    if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      void this.modalController.dismiss(undefined, 'cancel');
    }
  }

  public async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (!files.length) {
      return;
    }

    if (!this.deviceId) {
      this.uploadErrors = ['Missing device id'];
      return;
    }

    this.uploading = true;
    this.uploadErrors = [];

    for (const file of files) {
      try {
        const imageId = await this.devices.uploadDeviceImage(this.deviceId, file);
        this.images.push(imageId);
        void this.loadImageUrls();
      } catch (error) {
        let message;
        if (error instanceof HttpErrorResponse) {
          message = error.error.message ?? error.message ?? String(error);
        } else {
          message = (error as any).message ?? String(error);
        }
        console.log('Failed uploading image', error);
        this.uploadErrors.push(file.name + ': ' + message);
      }
    }

    this.uploading = false;
    if (input) {
      input.value = '';
    }
  }

  save() {
    const data: Partial<DiaryEntryData> = Object.fromEntries(Object.entries(this.data).filter(([key, value]) =>
      value !== undefined && value !== null && this.isFieldEditable('data.' + key)
    ));
    if (data.lifecycleName && this.fixedLifecycleName) {
      delete data.lifecycleName;
    }

    const entry: DiaryEntry = {
      category: this.category,
      time: DiaryEntryModalComponent.parseDateTimeInputValue(this.time),
      title: this.title,
      ...(this.isFieldEditable('message') ? {message: this.message} : {}),
      ...(this.images.length > 0 ? {images: this.images} : {}),
      ...(Object.keys(data).length > 0 ? {data} : {}),
      ...(defaultDiaryEntries[this.category].defaults ?? {}),
    };

    void this.modalController.dismiss(entry, 'save');
  }

  isFieldEditable(field: keyof (DiaryEntry & DiaryEntry['data']) | string) {
    if (!this.category) {
      return false;
    }

    if (field.includes('.')) {
      const [mainField, subField] = field.split('.') as [keyof DiaryEntry, keyof DiaryEntry['data']];
      const mainFieldValue = defaultDiaryEntries[this.category]?.[mainField];
      return typeof mainFieldValue === 'object' ? subField in mainFieldValue: false;
    }

    return field in (defaultDiaryEntries[this.category] ?? {});
  }

  isValid() {
    return this.category && (!this.isFieldEditable('title') || this.title) && !this.uploading;
  }

  triggerCameraInput() {
    this.cameraInput?.nativeElement?.click();
  }

  triggerFilesInput() {
    this.filesInput?.nativeElement?.click();
  }

  removeImage(imageId: string) {
    this.images = this.images.filter(id => id !== imageId);
  }

  async loadImageUrls() {
    if (!this.deviceId) {
      return;
    }

    for (const imageId of this.images) {
      if (!(imageId in this.imageIdToImageUrl)) {
        this.imageIdToImageUrl[imageId] = await this.devices.getDeviceImageUrl(this.deviceId, 'user/jpeg', undefined, undefined, imageId);
      }
    }
  }

  protected readonly getDiaryDataFieldUnit = getDiaryDataFieldUnit;

  private static toLocalDateTimeInputValue(time: Date | string): string {
    const date = time instanceof Date ? time : new Date(time);
    if (Number.isNaN(date.getTime())) {
      return DiaryEntryModalComponent.toLocalDateTimeInputValue(new Date());
    }

    const pad2 = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  private static parseDateTimeInputValue(value: string): Date {
    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }
}

export const getDiaryDataFieldUnit = (field: keyof DiaryEntryData | string) => {
  switch (field) {
    case 'co2FillingRest':
    case 'co2FillingInitial':
      return 'g';
    case 'lightMeasurement':
      return 'ppfd';
    case 'distanceMeasurement':
      return 'cm';
    case 'tdsMeasurement':
      return 'ppm';
    case 'ecMeasurement':
      return 'mS/cm';
    case 'outsideTemperatureMeasurement':
      return '°C';
    default:
      return '';
  }
};
