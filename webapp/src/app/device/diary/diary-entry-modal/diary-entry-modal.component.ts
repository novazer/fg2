import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {ModalController} from '@ionic/angular';
import {DeviceService} from 'src/app/services/devices.service';
import {HttpErrorResponse} from "@angular/common/http";

type DiaryEntryData = {
  co2FillingRest: number | undefined;
  co2FillingInitial: number | undefined;
  newLifecycleStage: undefined | 'germination' | 'seedling' | 'vegetative' | 'flowering' | 'drying' | 'curing';
  lightMeasurement: number | undefined;
  distanceMeasurement: number | undefined;
  tdsMeasurement: number | undefined;
  ecMeasurement: number | undefined;
  outsideTemperatureMeasurement: number | undefined;
  phMeasurement: number | undefined;
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
  'co2-refill': {
    defaults: {
      title: 'CO2 cylinder was refilled',
    },
    message: '',
    data: {
      co2FillingRest: 0,
      co2FillingInitial: 425,
    },
  },
  'plant-log': {
    defaults: {
      title: 'Plant log entry'
    },
    message: '',
  },
  'fridge-log': {
    defaults: {
      title: 'Fridge log entry'
    },
    message: '',
  },
  'measurement': {
    defaults: {
      title: 'User measurement',
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
  'plant-lifecycle': {
    defaults: {
      title: 'Plant phase change',
    },
    message: '',
    data: {
      newLifecycleStage: 'seedling',
    },
  },
}

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
  public time = new Date().toISOString();
  public category = 'plant-log';
  public data: Partial<DiaryEntryData> = {
    co2FillingRest: 0,
    co2FillingInitial: 425,
  };
  public images: string[] = [];
  public uploading = false;
  public uploadErrors: string[] = [];

  public imageIdToImageUrl: Record<string, string> = {};

  constructor(private modalController: ModalController, private devices: DeviceService) {
  }

  ngOnInit() {
    this.message = this.entry?.message || '';
    this.title = this.entry?.title || '';
    this.time = this.entry?.time ? this.entry.time.toISOString() : new Date().toISOString();
    this.category = this.entry?.category || 'plant-log';
    this.data = {
      co2FillingRest: this.entry?.data?.co2FillingRest || 0,
      co2FillingInitial: this.entry?.data?.co2FillingInitial || 425,
      newLifecycleStage: this.entry?.data?.newLifecycleStage,
      lightMeasurement : this.entry?.data?.lightMeasurement,
      distanceMeasurement : this.entry?.data?.distanceMeasurement,
      tdsMeasurement : this.entry?.data?.tdsMeasurement,
      ecMeasurement : this.entry?.data?.ecMeasurement,
      outsideTemperatureMeasurement : this.entry?.data?.outsideTemperatureMeasurement,
      phMeasurement : this.entry?.data?.phMeasurement,
    },
    this.images = this.entry?.images ? this.entry.images : [];
    void this.loadImageUrls();
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
    const data = Object.fromEntries(Object.entries(this.data).filter(([key, value]) =>
      value !== undefined && value !== null && this.isFieldEditable('data.' + key)
    ));

    const entry: DiaryEntry = {
      category: this.category,
      time: new Date(this.time),
      title: this.title,
      ...(this.isFieldEditable('message') ? {message: this.message} : {}),
      ...(this.images.length > 0 ? {images: this.images} : {}),
      ...(Object.keys(data).length > 0 ? {data} : {}),
      ...(defaultDiaryEntries[this.category].defaults ?? {})
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
