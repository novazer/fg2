import {Component, Input, OnChanges, OnInit, SimpleChanges} from '@angular/core';
import {DeviceService} from '../../../services/devices.service';
import {ModalController} from '@ionic/angular';
import {
  DiaryEntryModalComponent,
  defaultDiaryEntries,
} from "../diary-entry-modal/diary-entry-modal.component";
import {TranslateService} from '@ngx-translate/core';
import type { DiaryEntry, DeviceLog } from '@fg2/shared-types';

import { collectLogCategories } from '../../log-entry-viewer/log-entry-viewer.component';

export type LogEntry = DeviceLog & {
  imageUrls?: undefined | Promise<string>[];
  editable?: boolean;
};

@Component({
  selector: 'app-diary-entries-report',
  templateUrl: './diary-entries-report.component.html',
  styleUrls: ['./diary-entries-report.component.scss'],
})
export class DiaryEntriesReportComponent implements OnInit, OnChanges {
  @Input() deviceId = '';
  @Input() lastUpdated: number | undefined;
  @Input() readOnly = false;

  public logs: LogEntry[] = [];
  private allLogs: LogEntry[] = [];
  public loading = false;
  public availableLogCategories: string[] = [];
  public selectedLogCategories: string[] = ['diary'];

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
      this.allLogs = [];
      this.availableLogCategories = [];
      return;
    }

    this.loading = true;
    try {
      this.allLogs = (await this.devices.getLogs(this.deviceId, undefined, undefined, true)).reverse();
      this.allLogs.forEach(l => {
        l.imageUrls = l.images?.map(url => this.getImageUrl(url));
        l.editable = this.isEditableLog(l);
      });
      this.availableLogCategories = collectLogCategories(this.allLogs);

      // Reset to ['diary'] if no longer available, otherwise keep current selection
      if (!this.availableLogCategories.some(cat => this.selectedLogCategories.includes(cat))) {
        this.selectedLogCategories = this.availableLogCategories.includes('diary') ? ['diary'] : [];
      }

      this.logs = this.allLogs;
    } finally {
      this.loading = false;
    }
  }

  onIncludeSystemEntriesChange(): void {
    void this.loadData();
  }

  logCategoryChanged(selectedCategories?: string[]): void {
    this.selectedLogCategories = selectedCategories && selectedCategories.length > 0 ? selectedCategories : ['diary'];
  }

  isEditableLog(log: DeviceLog): boolean {
    return log.categories?.length === 2 && log.categories[0] === 'diary' && log.categories[1] in defaultDiaryEntries;
  }

  async openEditModal(log: LogEntry): Promise<void> {
    if (this.readOnly) {
      return;
    }

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
        categories: ['diary', result.data.category || 'unknown'],
        data: result.data.data,
        images: result.data.images,
        severity: log.severity ?? 0,
        deleted: log.deleted ?? false,
      };

      await this.devices.updateLog(this.deviceId, log._id, payload);

      log.title = payload.title;
      log.message = payload.message;
      log.time = payload.time ?? log.time;
      log.categories = payload.categories;
      log.data = payload.data;
      log.images = payload.images;
      log.imageUrls = payload.images?.map(imageId => this.getImageUrl(imageId));
      log.editable = this.isEditableLog(log);
      this.availableLogCategories = collectLogCategories(this.allLogs);

      // Reset to ['diary'] if no longer available
      if (!this.availableLogCategories.some(cat => this.selectedLogCategories.includes(cat))) {
        this.selectedLogCategories = ['diary'];
      }

      this.logs = this.allLogs;
    }
  }

  async deleteLog(log: DeviceLog): Promise<void> {
    if (this.readOnly) {
      return;
    }

    const confirmMessage = this.translate.instant('diary.confirmDelete');
    if (!confirm(confirmMessage)) {
      return;
    }

    await this.devices.deleteLog(this.deviceId, log._id);
    this.allLogs = this.allLogs.filter(entry => entry._id !== log._id);
    this.availableLogCategories = collectLogCategories(this.allLogs);

    // Reset to ['diary'] if no longer available
    if (!this.availableLogCategories.some(cat => this.selectedLogCategories.includes(cat))) {
      this.selectedLogCategories = ['diary'];
    }

    this.logs = this.allLogs;
  }

  private toDiaryEntry(log: DeviceLog): DiaryEntry {
    return {
      title: log.title ?? '',
      message: log.message,
      time: log.time,
      category: log.categories?.[1] ?? '',
      data: log.data,
      images: log.images,
    };
  }

  getImageUrl(imageId: string) {
    return this.devices.getDeviceImageUrl(this.deviceId, 'user/jpeg', undefined, undefined, imageId);
  }


  disableLogGrouping(): void {
    // Placeholder for future grouping logic if needed in diary report
  }
}
