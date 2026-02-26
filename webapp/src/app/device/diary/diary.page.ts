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

@Component({
  selector: 'app-diary',
  templateUrl: './diary.page.html',
  styleUrls: ['./diary.page.scss'],
})
export class DiaryPage implements OnInit, OnDestroy {
  public deviceId: string = '';
  public cloudSettings: any = {};

  private devicesSub: Subscription | undefined;

  constructor(private route: ActivatedRoute, private router: Router, private data: DataService, private devices: DeviceService) {
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
}
