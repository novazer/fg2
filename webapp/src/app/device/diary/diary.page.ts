import {Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {ChartConfiguration, ChartEvent, ChartType} from 'chart.js';
import {BaseChartDirective} from 'ng2-charts';
import {firstValueFrom, Subscription} from 'rxjs';
import 'chartjs-adapter-luxon';
import {ActivatedRoute, Router} from '@angular/router';
import {environment} from 'src/environments/environment';
import {DataService} from 'src/app/services/data.service';
import * as Highcharts from 'highcharts/highstock';
import {DeviceLog, DeviceService} from 'src/app/services/devices.service';
import {PlotLineOrBand, XAxisPlotLinesOptions} from "highcharts";
import {YAxisOptions} from "highcharts/highstock";
import { ModalController } from '@ionic/angular';
import {DiaryEntry, DiaryEntryModalComponent} from './diary-entry-modal/diary-entry-modal.component';
import {OverlayEventDetail} from "@ionic/core/components";

@Component({
  selector: 'app-diary',
  templateUrl: './diary.page.html',
  styleUrls: ['./diary.page.scss'],
})
export class DiaryPage implements OnInit, OnDestroy {
  public deviceId: string = '';
  public cloudSettings: any = {};
  public lastUpdated: number | undefined;

  public selectedReport: 'co2report' | 'entries' = 'entries';

  private devicesSub: Subscription | undefined;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private data: DataService,
    private devices: DeviceService,
    private modalController: ModalController
  ) {
  }

  ngOnInit(): void {
    this.deviceId = this.route.snapshot.paramMap.get('device_id') || '';

    this.devicesSub = this.devices.devices.subscribe((devices) => {
      const device = devices.find((device) => device.device_id == this.deviceId);
      this.cloudSettings = device?.cloudSettings || {};
    });
  }

  ngOnDestroy(): void {
    this.devicesSub?.unsubscribe();
    this.devicesSub = undefined;
  }

  async openEntryModal() {
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
      }
      await this.devices.addLog(this.deviceId, data);
      this.lastUpdated = Date.now();
    }

  }

  reportSelected() {

  }
}
