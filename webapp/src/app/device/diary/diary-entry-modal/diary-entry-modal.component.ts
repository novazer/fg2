import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {ModalController} from '@ionic/angular';
import {DeviceService} from 'src/app/services/devices.service';
import {HttpErrorResponse} from "@angular/common/http";

export type DiaryEntry = {
  message?: string;
  title: string;
  time: Date;
  category: string;
  data?: {
    co2FillingRest?: number;
    co2FillingInitial?: number;
  },
  images?: string[];
};

export const defaultDiaryEntries : Record<string, Partial<DiaryEntry>> = {
  'co2-refill': {
    title: 'CO2 cylinder was refilled',
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
  public category = '';
  public data = {
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
    this.category = this.entry?.category || '';
    this.data.co2FillingRest = this.entry?.data?.co2FillingRest || 0;
    this.data.co2FillingInitial = this.entry?.data?.co2FillingInitial || 425;
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
    const data: DiaryEntry = {
      message: this.message,
      title: this.title,
      time: new Date(this.time),
      category: this.category,
      data: this.data,
      images: this.images,
      ...(defaultDiaryEntries[this.category] || {})
    };

    void this.modalController.dismiss(data, 'save');
  }

  isFieldEditable(field: keyof (DiaryEntry & DiaryEntry['data'])) {
    if (!this.category) {
      return false;
    }

    return !defaultDiaryEntries[this.category]?.[field as keyof DiaryEntry] && !defaultDiaryEntries[this.category]?.data?.[field as keyof DiaryEntry['data']];
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
}
