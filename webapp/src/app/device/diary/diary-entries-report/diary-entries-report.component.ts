import {Component, Input, OnChanges, OnInit, SimpleChanges} from '@angular/core';
import {DeviceLog, DeviceService} from '../../../services/devices.service';
import {ModalController} from '@ionic/angular';
import {DiaryEntry, DiaryEntryModalComponent, defaultDiaryEntries} from "../diary-entry-modal/diary-entry-modal.component";
import {TranslateService} from '@ngx-translate/core';

@Component({
  selector: 'app-diary-entries-report',
  templateUrl: './diary-entries-report.component.html',
  styleUrls: ['./diary-entries-report.component.scss'],
})
export class DiaryEntriesReportComponent implements OnInit, OnChanges {
  @Input() deviceId = '';

  public logs: DeviceLog[] = [];
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
    if (changes['deviceId'] && !changes['deviceId'].firstChange) {
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
      const entries = await this.devices.getLogs(this.deviceId, undefined, undefined, true, categories);
      this.logs = entries.slice().reverse();
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

  async openEditModal(log: DeviceLog): Promise<void> {
    if (!this.isEditableLog(log)) {
      return;
    }

    const modal = await this.modalController.create({
      component: DiaryEntryModalComponent,
      backdropDismiss: false,
      componentProps: {
        entry: this.toDiaryEntry(log),
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

      await this.devices.addLog(this.deviceId, payload);

      log.title = payload.title;
      log.message = payload.message;
      log.time = payload.time?.toISOString?.() ?? log.time;
      log.categories = payload.categories;
      log.data = payload.data;
      log.images = payload.images;
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
}
