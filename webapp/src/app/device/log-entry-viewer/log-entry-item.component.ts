import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import { LogEntryViewerLog } from './log-entry-viewer.component';
import { getDiaryDataFieldUnit } from '../diary/diary-entry-modal/diary-entry-modal.component';
import { ModalController } from '@ionic/angular';
import { ImageViewerModalComponent } from '../diary/image-viewer-modal/image-viewer-modal.component';
import {DeviceService} from "../../services/devices.service";

@Component({
  selector: 'app-log-entry-item',
  templateUrl: './log-entry-item.component.html',
})
export class LogEntryItemComponent implements OnChanges {
  @Input() entry!: LogEntryViewerLog;
  @Input() showCategories = false;
  @Input() showEdit = false;
  @Input() showDelete = false;
  @Input() editable = false;
  @Input() timeOnly = false;

  @Output() showAll = new EventEmitter<LogEntryViewerLog>();
  @Output() edit = new EventEmitter<LogEntryViewerLog>();
  @Output() delete = new EventEmitter<LogEntryViewerLog>();

  constructor(private modalController: ModalController, private devices: DeviceService) {}

  public imageIdToUrl = new Map<string, string>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['entry']) {
      this.collectImageUrls(this.entry);
    }
  }

  collectImageUrls(log: LogEntryViewerLog): void {
    log.images?.forEach(async imageId => {
      if (!this.imageIdToUrl.has(imageId)) {
        const url = await this.devices.getDeviceImageUrl(log.device_id, 'user/jpeg', undefined, undefined, imageId);
        this.imageIdToUrl.set(imageId, url);
      }
    });
  }

  async onImageClick(event: Event, index: number): Promise<void> {
    event.preventDefault();
    await this.openImageModal(index);
  }

  onShowAll(event: Event): void {
    event.preventDefault();
    this.showAll.emit(this.entry);
  }

  canEdit(entry: LogEntryViewerLog): boolean {
    return this.editable || entry.editable === true;
  }

  protected readonly getDiaryDataFieldUnit = getDiaryDataFieldUnit;

  private async openImageModal(index: number): Promise<void> {
    const imageUrls = this.entry.images?.map(imageId => this.imageIdToUrl.get(imageId) ?? '') || [];
    if (!imageUrls.length) {
      return;
    }

    const startIndex = Math.min(Math.max(index, 0), imageUrls.length - 1);
    const modal = await this.modalController.create({
      component: ImageViewerModalComponent,
      componentProps: {
        imageUrls,
        startIndex,
      },
      cssClass: 'dialog-fullscreen',
      initialBreakpoint: 1,
      breakpoints: [0, 1],
    });

    await modal.present();
  }

}
