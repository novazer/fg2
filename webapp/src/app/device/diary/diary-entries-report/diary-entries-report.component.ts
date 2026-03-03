import {Component, Input, OnChanges, OnInit, SimpleChanges} from '@angular/core';
import {DeviceLog, DeviceService} from '../../../services/devices.service';
import {ModalController} from '@ionic/angular';
import {DiaryEntry, DiaryEntryModalComponent, defaultDiaryEntries} from "../diary-entry-modal/diary-entry-modal.component";
import {TranslateService} from '@ngx-translate/core';
import { ImageViewerModalComponent } from '../image-viewer-modal/image-viewer-modal.component';

export type LogEntry = DeviceLog & {
  imageUrls?: undefined | Promise<string>[];
};

@Component({
  selector: 'app-diary-entries-report',
  templateUrl: './diary-entries-report.component.html',
  styleUrls: ['./diary-entries-report.component.scss'],
})
export class DiaryEntriesReportComponent implements OnInit, OnChanges {
  @Input() deviceId = '';
  @Input() lastUpdated: number | undefined;

  public logs: LogEntry[] = [];
  public loading = false;
  public includeSystemEntries = false;

  constructor(
    private devices: DeviceService,
    private modalController: ModalController,
    private translate: TranslateService,
  ) {
  }

  ngOnInit(): void {
    void this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['deviceId'] && !changes['deviceId'].firstChange)
      || (changes['lastUpdated'] && !changes['lastUpdated'].firstChange)) {
      void this.loadData();
    }
  }

  async loadData(): Promise<void> {
    if (!this.deviceId) {
      this.logs = [];
      return;
    }

    this.loading = true;
    try {
      const categories = this.includeSystemEntries ? undefined : Object.keys(defaultDiaryEntries);
      this.logs = (await this.devices.getLogs(this.deviceId, undefined, undefined, true, categories)).reverse();
      this.logs.forEach(l => l.imageUrls = l.images?.map(url => this.getImageUrl(url)));
    } finally {
      this.loading = false;
    }
  }

  onIncludeSystemEntriesChange(): void {
    void this.loadData();
  }

  isEditableLog(log: DeviceLog): boolean {
    return log.categories?.length === 1 && log.categories[0] in defaultDiaryEntries;
  }

  async openEditModal(log: LogEntry): Promise<void> {
    if (!this.isEditableLog(log)) {
      return;
    }

    const modal = await this.modalController.create({
      component: DiaryEntryModalComponent,
      backdropDismiss: false,
      componentProps: {
        entry: this.toDiaryEntry(log),
        deviceId: this.deviceId,
      },
    });

    await modal.present();
    const result = await modal.onDidDismiss<DiaryEntry>();

    if (result.role === 'save' && result.data) {
      const payload = {
        title: result.data.title ?? '',
        message: result.data.message ?? result.data.title ?? '',
        time: result.data.time,
        raw: true,
        categories: [result.data.category || 'unknown'],
        data: result.data.data,
        images: result.data.images,
        severity: log.severity ?? 0,
        deleted: log.deleted ?? false,
      };

      await this.devices.updateLog(this.deviceId, log._id, payload);

      log.title = payload.title;
      log.message = payload.message;
      log.time = payload.time?.toISOString?.() ?? log.time;
      log.categories = payload.categories;
      log.data = payload.data;
      log.images = payload.images;
      log.imageUrls = payload.images?.map(imageId => this.getImageUrl(imageId));
    }
  }

  async deleteLog(log: DeviceLog): Promise<void> {
    const confirmMessage = this.translate.instant('diary.confirmDelete');
    if (!confirm(confirmMessage)) {
      return;
    }

    await this.devices.deleteLog(this.deviceId, log._id);
    this.logs = this.logs.filter(entry => entry._id !== log._id);
  }

  private toDiaryEntry(log: DeviceLog): DiaryEntry {
    return {
      title: log.title ?? '',
      message: log.message,
      time: new Date(log.time),
      category: log.categories?.[0] ?? '',
      data: log.data,
      images: log.images,
    };
  }

  getImageUrl(imageId: string) {
    return this.devices.getDeviceImageUrl(this.deviceId, 'user/jpeg', undefined, undefined, imageId);
  }

  async openImageModal(log: LogEntry, index: number): Promise<void> {
    if (!log.imageUrls?.length) {
      return;
    }

    const imageUrls = await Promise.all(log.imageUrls);
    const modal = await this.modalController.create({
      component: ImageViewerModalComponent,
      componentProps: {
        imageUrls,
        startIndex: index,
      },
      cssClass: 'dialog-fullscreen',
      initialBreakpoint: 1,
      breakpoints: [0, 1],
    });

    await modal.present();
  }
}
