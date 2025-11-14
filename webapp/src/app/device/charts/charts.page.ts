import {Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChartConfiguration, ChartEvent, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { firstValueFrom } from 'rxjs';
import 'chartjs-adapter-luxon';
import { ActivatedRoute } from '@angular/router';
import { environment } from 'src/environments/environment';
import { DataService } from 'src/app/services/data.service';
import * as Highcharts from 'highcharts/highstock';
import { DeviceService } from 'src/app/services/devices.service';

declare var require: any;
let Boost = require('highcharts/modules/boost');
let noData = require('highcharts/modules/no-data-to-display');
let More = require('highcharts/highcharts-more');

Boost(Highcharts);
noData(Highcharts);
More(Highcharts);
noData(Highcharts);

const IS_TOUCH_DEVICE = window.matchMedia("(pointer: coarse)").matches;

@Component({
  selector: 'app-charts',
  templateUrl: './charts.page.html',
  styleUrls: ['./charts.page.scss'],
})
export class ChartsPage implements OnInit, OnDestroy {
  Highcharts: typeof Highcharts = Highcharts;
  updateFlag:boolean = false;
  chartOptions: Highcharts.Options = {
    chart: {
      animation: true,
      panning: {
        enabled: true,
        type: 'x',
      },
      panKey: 'ctrl',
      zooming: {
        type: 'x',
        key: 'shift',
        resetButton: {
          position: {
            align: 'right',
            verticalAlign: 'top',
          },
        },
        singleTouch: false,
      }
    },
    rangeSelector: {
      buttons: [],
      inputEnabled: false
    },

    yAxis: [],
    time: {
      useUTC: false
    },
    series: [],

    navigator: {
      enabled: window.innerHeight > 600 && !IS_TOUCH_DEVICE,
    }
  };

  public timespans = [
    { name: '20m', duration: '-20m', interval:'10s', enabled: false },
    { name: '1h', duration: '-1h', interval:'10s', enabled: false },
    { name: '6h', duration: '-6h', interval:'10s', enabled: false },
    { name: '12h', duration: '-12h', interval:'10s', enabled: false },
    { name: '24h', duration: '-1d', interval:'20s', enabled: true },
    { name: '3d', duration: '-3d', interval:'1m', enabled: false },
    { name: '1w', duration: '-7d', interval:'10m', enabled: false },
    { name: '1m', duration: '-30d', interval:'60m', enabled: false},
    { name: '3m', duration: '-90d', interval:'180m', enabled: false },
    { name: '6m', duration: '-180d', interval:'360m', enabled: false },
    { name: '1y', duration: '-365d', interval:'720m', enabled: false },
  ]

  public measures = [
    { title: 'Temperature', icon: 'temperature', color: '#f00', name: 'temperature', txt: 'T', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer']},
    // { title: 'AVG', icon: 'temperature', color: '#f00', name: 'avg', txt: 'avg', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge']},
    { title: 'Humidity', icon: 'humidity', color: '#00f', name: 'humidity', txt: 'H', unit: '%', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer']},
    { title: 'CO2', icon: 'co2', color: '#000', name: 'co2', txt: 'CO2', unit: 'ppm', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'plug']},
    { title: 'Heater', icon: 'heating', color: '#f00', name: 'out_heater', txt: 'T', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'dryer']},
    // { title: 'P', icon: 'heating', color: '#f00', name: 'p', txt: 'P', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'I', icon: 'heating', color: '#f00', name: 'i', txt: 'I', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'D', icon: 'heating', color: '#f00', name: 'd', txt: 'D', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    { title: 'Dehumidifier', icon: 'dehumidify', color: '#00f', name: 'out_dehumidifier', txt: 'H', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'dryer']},
    { title: 'Fan', icon: 'fan_out', color: '#00f', name: 'out_fan', txt: 'Fan', unit: '%', enabled: false, right: false, nav: false, types: ['fan']},
    // { title: 'RPM', icon: 'fan_rpm', color: '#00f', name: 'rpm',     txt: 'rpm', unit: '',  enabled: false, right: false, nav: false, types: ['fan']},
    { title: 'CO2', icon: 'co2_valve', color: '#000', name: 'out_co2', txt: 'CO2 Valve', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2']},
    { title: 'Lights', icon: 'light', color: '#000', name: 'out_light', txt: 'Lights', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'light']},
    { title: 'Day', icon: 'light', color: '#000', name: 'day', txt: 'Day', unit: '', enabled: false, right: false, nav: false, types: ['fan']},
  ]


  public filtered_measures: any[] = [];

  public lineChartType: ChartType = 'line';
  public start_ts = 0;
  public end_ts = 0;

  public loaded = false;
  public device_id:string = ""
  public device_type:string = ""

  public autoUpdate:boolean = false;

  public chartInstance!: Highcharts.Chart;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('spacer') spacer? : ElementRef;

  private interval?: NodeJS.Timeout;

  constructor(private route: ActivatedRoute, private data: DataService, private devices: DeviceService) {
  }

  ngOnInit(){
    this.device_id = this.route.snapshot.paramMap.get('device_id') || '';
    this.devices.devices.subscribe((devices) => {
      this.device_type = devices.find((device) => device.device_id == this.device_id)?.device_type || '';
      if(this.device_type != "") {
        console.log(this.measures)
        console.log(this.device_type)
        this.filtered_measures = this.measures.filter((measure) => measure.types.includes(this.device_type))
        console.log(this.filtered_measures)

        setTimeout(() => this.loadData(), 10)
        this.interval = setInterval(() => {
          if (this.autoUpdate) {
            void this.loadData();
          }
        }, 10000)
      }
    })
  }

  ngOnDestroy() {
    if(this.interval) {
      clearInterval(this.interval);
    }
  }

  private async loadData() {

    let span:string, interval:string;

    for(let ts of this.timespans) {
      if(ts.enabled) {
        span = ts.duration;
        interval = ts.interval;
        break;
      }
    }

    let active = 0;
    for(let m of this.measures) {
      if(m.enabled) {
        m.nav = active == 0;
        m.right = (active++ % 2) != 0;
      }
    }

    // @ts-ignore
    this.chartOptions.chart.animation = !this.autoUpdate;

    this.chartOptions.yAxis = [];
    for(let axis = 0; axis < this.filtered_measures.length; axis++) {
      let measure = this.filtered_measures[axis]

      this.chartOptions.yAxis.push({
        labels: {
          format: '{value}' + measure.unit,
          style: {
              color: measure.color,
              fontSize: '8px'
          }
        },
        softMin: 0,
        softMax: 1,
        opposite: measure.right,
        visible: (this.spacer?.nativeElement.offsetWidth || 0) > 320 ? measure.enabled : false
      })

      measure.axis = axis;
    }

    let series = await Promise.all(this.filtered_measures.map(async (measure:any):Promise<Highcharts.SeriesOptionsType> => {
      return {
        name: measure.title,
        type: "area",
        data: measure.enabled ? await this.data.getSeries(this.device_id, measure.name, span, interval) : [],
        yAxis: measure.axis,
        color: measure.color,
        fillOpacity: 0.1,
        threshold: null,
        visible: measure.enabled,
        showInNavigator: measure.nav,
        tooltip: {
          valueDecimals: 2,
          valueSuffix: measure.unit
        }
      };
    }));

    this.chartOptions.series = series;

    this.updateFlag = true;
    this.loaded = true;

    // this.lineChartData.datasets[1].data = await this.data.getSeries(room_id, 'humidity', span, interval);
    // this.lineChartData.datasets[2].data = await this.data.getSeries(room_id, 'co2', span, interval);
    // this.chart?.update();
  }

  public setSpan(ts:any) {
    for(let tsp of this.timespans) {tsp.enabled = false}
    ts.enabled = true;

    this.loadData().then(() => this.chartInstance?.zoomOut());
  }

  public toggleMeasure(measure:any) {
    measure.enabled = !measure.enabled;

    this.loadData();
  }

  public onChartInstance(chart: Highcharts.Chart) {
    this.chartInstance = chart;
  }
}
