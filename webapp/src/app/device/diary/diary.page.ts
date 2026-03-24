import {Component, OnInit} from '@angular/core';
import 'chartjs-adapter-luxon';
import {ActivatedRoute} from '@angular/router';
import {DeviceService} from 'src/app/services/devices.service';
import { ModalController } from '@ionic/angular';
import {DiaryEntryModalComponent} from './diary-entry-modal/diary-entry-modal.component';
import {OverlayEventDetail} from "@ionic/core/components";
import type { DiaryEntry } from '@fg2/shared-types';

@Component({
  selector: 'app-diary',
  templateUrl: './diary.page.html',
  styleUrls: ['./diary.page.scss'],
})
export class DiaryPage implements OnInit {
  public deviceId: string = '';
  public cloudSettings: any = {};
  public lastUpdated: number | undefined;
  public isPublic = false;
  public canEdit = true;

  public selectedReport: 'co2report' | 'entries' | 'growreport' = 'entries';

  constructor(
    private route: ActivatedRoute,
    private devices: DeviceService,
    private modalController: ModalController
  ) {
  }

  ngOnInit(): void {
    this.deviceId = this.route.snapshot.paramMap.get('device_id') || '';

    void this.devices.resolveDeviceAccessInfo(this.deviceId)
      .then(deviceAccessInfo => {
        this.isPublic = deviceAccessInfo.isPublic;
        this.canEdit = !deviceAccessInfo.isPublic;
        this.cloudSettings = deviceAccessInfo.cloudSettings || {};
      })
      .catch(() => {
        this.isPublic = false;
        this.canEdit = false;
        this.cloudSettings = {};
      });
  }

  async openEntryModal() {
    if (!this.canEdit) {
      return;
    }

    const modal = await this.modalController.create({
      component: DiaryEntryModalComponent,
      backdropDismiss: false,
      componentProps: {
        deviceId: this.deviceId,
      },
    });

    await modal.present();
    const result: OverlayEventDetail<DiaryEntry> = await modal.onDidDismiss();

    if (result.role === 'save') {
      const data = {
        title: result.data?.title ?? '',
        message: result.data?.message ?? result.data?.title ?? '',
        time: result.data?.time,
        raw: true,
        categories: ['diary', result.data?.category || 'unknown'],
        data: result.data?.data,
        images: result.data?.images,
        severity: 0,
        deleted: true,
      };
      await this.devices.addLog(this.deviceId, data);
      this.lastUpdated = Date.now();
    }

  }

  reportSelected() {

  }
}
