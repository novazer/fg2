import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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
import TimeAgo from 'javascript-time-ago'
// English.
import en from 'javascript-time-ago/locale/en'
TimeAgo.addDefaultLocale(en)
// Create formatter (English).
const timeAgo = new TimeAgo('en-US')

declare var require: any;
let Boost = require('highcharts/modules/boost');
let noData = require('highcharts/modules/no-data-to-display');
let More = require('highcharts/highcharts-more');

Boost(Highcharts);
noData(Highcharts);
More(Highcharts);
noData(Highcharts);

@Component({
  selector: 'app-diagnostics',
  templateUrl: './diagnostics.page.html',
  styleUrls: ['./diagnostics.page.scss'],
})
export class DiagnosticsPage implements OnInit {
  Highcharts: typeof Highcharts = Highcharts;
  updateFlag:boolean = false;
  chartOptions: Highcharts.Options = {
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
      enabled: window.innerHeight > 600
    }
  };

  public timespans = [
    { name: '1h', duration: '-1h', interval:'10s', enabled: false },
    { name: '24h', duration: '-1d', interval:'20s', enabled: true },
    { name: '1w', duration: '-7d', interval:'10m', enabled: false },
    { name: '1m', duration: '-30d', interval:'60m', enabled: false}
  ]

  public measures = [
    { title: 'Temperature', icon: 'temperature', color: '#f00', name: 'temperature', txt: 'T', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge', 'foo', 'fan', 'light', 'plug']},
    // { title: 'AVG', icon: 'temperature', color: '#f00', name: 'avg', txt: 'avg', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge']},
    { title: 'Humidity', icon: 'humidity', color: '#00f', name: 'humidity', txt: 'H', unit: '%', enabled: false, right: false, nav: false, types: ['fridge', 'foo', 'fan', 'light', 'plug']},
    { title: 'CO2', icon: 'co2', color: '#000', name: 'co2', txt: 'CO2', unit: 'ppm', enabled: false, right: false, nav: false, types: ['fridge', 'foo', 'plug']},
    { title: 'Heater', icon: 'heating', color: '#f00', name: 'out_heater', txt: 'T', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'P', icon: 'heating', color: '#f00', name: 'p', txt: 'P', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'I', icon: 'heating', color: '#f00', name: 'i', txt: 'I', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'D', icon: 'heating', color: '#f00', name: 'd', txt: 'D', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    { title: 'Dehumidifier', icon: 'dehumidify', color: '#00f', name: 'out_dehumidifier', txt: 'H', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    { title: 'Fan', icon: 'fan_out', color: '#00f', name: 'out_fan', txt: 'Fan', unit: '%', enabled: false, right: false, nav: false, types: ['fan']},
    // { title: 'RPM', icon: 'fan_rpm', color: '#00f', name: 'rpm',     txt: 'rpm', unit: '',  enabled: false, right: false, nav: false, types: ['fan']},
    { title: 'CO2', icon: 'co2_valve', color: '#000', name: 'out_co2', txt: 'CO2 Valve', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    { title: 'Lights', icon: 'light', color: '#000', name: 'out_light', txt: 'Lights', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo', 'light']},
    { title: 'Day', icon: 'light', color: '#000', name: 'day', txt: 'Day', unit: '', enabled: false, right: false, nav: false, types: ['fan']},
  ]


  public filtered_measures: any[] = [];

  public lineChartType: ChartType = 'line';
  public start_ts = 0;
  public end_ts = 0;

  public loaded = false;
  public serialnumber:string = ""
  public device_id:string = ""
  public device_type:string = ""

  public device_config:any;
  public device_logs:any;

  public configtext:string = ""

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('spacer') spacer? : ElementRef;

  constructor(private route: ActivatedRoute, private data: DataService, private devices: DeviceService) {
  }

  ngOnInit(){

  }

  public async loadDevice() {
    const device = await this.devices.getBySerial(this.serialnumber)

    this.device_type = device.device_type;
    this.device_id = device.device_id

    if(this.device_type != "") {
      this.filtered_measures = this.measures.filter((measure) => measure.types.includes(this.device_type))
      //this.loadData()
      setTimeout(() => this.loadData(), 10)
    }

    this.configtext = await this.devices.getConfig(this.device_id)
    this.device_config = JSON.parse(await this.devices.getConfig(this.device_id))
    this.device_logs = await this.devices.getLogs(this.device_id)
    for(let log of this.device_logs) {
      log.time = timeAgo.format(new Date(log.time))
    }
  }

  public async loadData() {

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

    this.loadData();
  }

  public toggleMeasure(measure:any) {
    measure.enabled = !measure.enabled;

    this.loadData();
  }

}
