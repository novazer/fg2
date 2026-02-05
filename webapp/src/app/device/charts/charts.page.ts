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
import {DeviceLog, DeviceService} from 'src/app/services/devices.service';
import {PlotLineOrBand, XAxisPlotLinesOptions} from "highcharts";
import {YAxisOptions} from "highcharts/highstock";

declare var require: any;
let Boost = require('highcharts/modules/boost');
let noData = require('highcharts/modules/no-data-to-display');
let More = require('highcharts/highcharts-more');

Boost(Highcharts);
noData(Highcharts);
More(Highcharts);
noData(Highcharts);

const IS_TOUCH_DEVICE = window.matchMedia("(pointer: coarse)").matches;

const IMAGE_LOAD_DELAY_MS = 500;

@Component({
  selector: 'app-charts',
  templateUrl: './charts.page.html',
  styleUrls: ['./charts.page.scss'],
})
export class ChartsPage implements OnInit, OnDestroy {
  Highcharts: typeof Highcharts = Highcharts;
  updateFlag:boolean = false;
  chartOptions: Highcharts.Options;

  public timespans = [
    { name: '20m', durationValue: 20, durationUnit: 'm', defaultInterval:'5s' },
    { name: '1h', durationValue: 1, durationUnit: 'h', defaultInterval:'10s', highlight: true },
    { name: '6h', durationValue: 6, durationUnit: 'h', defaultInterval:'10s' },
    { name: '12h', durationValue: 12, durationUnit: 'h', defaultInterval:'10s' },
    { name: '1d', durationValue: 24, durationUnit: 'h', defaultInterval:'20s', highlight: true, imageIntervalMs: 86400000 },
    { name: '3d', durationValue: 3, durationUnit: 'd', defaultInterval:'1m', highlight: true },
    { name: '1w', durationValue: 7, durationUnit: 'd', defaultInterval:'15m', highlight: true, imageIntervalMs: 7 * 86400000 },
    { name: '1m', durationValue: 30, durationUnit: 'd', defaultInterval:'1h', highlight: true, imageIntervalMs: 30 * 86400000 },
    { name: '3m', durationValue: 90, durationUnit: 'd', defaultInterval:'4h' },
    { name: '6m', durationValue: 180, durationUnit: 'd', defaultInterval:'1d' },
    { name: '1y', durationValue: 1, durationUnit: 'y', defaultInterval:'1w' },
    { name: '3y', durationValue: 3, durationUnit: 'y', defaultInterval:'1w' },
  ];

  public intervals = ['5s', '10s', '20s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

  public selectedTimespan = this.timespans.find(ts => ts.name === '1d')!;

  public selectedInterval = this.selectedTimespan.defaultInterval;

  public measures = [
    { title: 'Temperature', icon: 'temperature', color: '#f00', name: 'temperature', txt: 'T', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer']},
    // { title: 'AVG', icon: 'temperature', color: '#f00', name: 'avg', txt: 'avg', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge']},
    { title: 'Humidity', icon: 'humidity', color: '#00f', name: 'humidity', txt: 'H', unit: '%', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer']},
    { title: 'VPD', icon: 'vpd', color: '#0f0', name: 'vpd', txt: 'V', unit: 'kPa', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer']},
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
  public device_id:string = "";
  public device_type:string = "";
  public cloudSettings: any = {};

  public autoUpdate:boolean = false;

  public offset: number = 0;

  public vpdMode: 'all' | 'day' | 'night' = 'all';

  public offsetFocused: boolean = false;

  public useCustom = false;

  public showImage = false;

  public showLogs = false;

  public deviceLogs: DeviceLog[] = [];

  public filteredLogs: (DeviceLog & { count?: number; })[] = [];

  public filteredLogsSelectionFiltered: boolean = false;

  public deviceLogCategories: Set<string> = new Set<string>();

  public selectedLogCategory: string = 'all';

  public deviceImageUrl: string | undefined = undefined;

  public chartInstance!: Highcharts.Chart;

  public currentImageTimestamp: number | undefined = undefined;

  private currentDataLoadStartTime: number = 0;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('spacer') spacer? : ElementRef;

  private interval?: NodeJS.Timeout;

  public selectedLogs: DeviceLog[] = [];

  constructor(private route: ActivatedRoute, private data: DataService, private devices: DeviceService) {
    this.chartOptions = {
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
        },
      },
      plotOptions: {
        series: {
          point: {
            events: {
              mouseOver: e => {
                const target = e.target as any;
                const timestamp = target.x;
                this.currentImageTimestamp = timestamp;

                setTimeout(() => {
                  void this.loadDeviceImage(timestamp);
                }, IMAGE_LOAD_DELAY_MS);

                if (target.series.initialType === 'column') {
                  const category = target.category;
                  const dataGroup = target.dataGroup;
                  const timestamps = dataGroup ? [...target.series.xData].splice(dataGroup.start, dataGroup.length) : [category];
                  this.selectedLogs.splice(0, this.selectedLogs.length);
                  this.selectedLogs.push(...this.deviceLogs.filter(log => timestamps.includes(Date.parse(log.time))));
                  this.filterLogs();
                }
              },
            }
          }
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
  }

  ngOnInit(){
    this.device_id = this.route.snapshot.paramMap.get('device_id') || '';
    this.devices.devices.subscribe((devices) => {
      const device = devices.find((device) => device.device_id == this.device_id);
      this.device_type = device?.device_type || '';
      this.cloudSettings = device?.cloudSettings || {};
      if(this.device_type != "") {
        this.filtered_measures = this.measures.filter((measure) => measure.types.includes(this.device_type))

        setTimeout(() => this.loadData(), 10)
        this.interval = setInterval(() => {
          if (this.autoUpdate && !this.offsetFocused && this.offset >= 0) {
            this.currentImageTimestamp = undefined;
            this.selectedLogs.splice(0, this.selectedLogs.length);
            void this.loadDeviceImage();
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

  public getAvailableTimespans() {
    const showImageControls = this.showLightOffsetControls() && this.showImage;
    return this.timespans.filter(ts => !showImageControls || ts.imageIntervalMs);
  }

  private async loadData() {
    const thisDataLoadStartTime = this.currentDataLoadStartTime = Date.now();

    const toValue = this.offset * this.selectedTimespan.durationValue;
    const fromValue = -this.selectedTimespan.durationValue + toValue;
    const from = String(fromValue) + this.selectedTimespan.durationUnit;
    const to = String(toValue) + this.selectedTimespan.durationUnit;
    const unitMs = (
      this.selectedTimespan.durationUnit === 'm' ? 60000 :
      this.selectedTimespan.durationUnit === 'h' ? 3600000 :
      this.selectedTimespan.durationUnit === 'd' ? 86400000 :
      this.selectedTimespan.durationUnit === 'y' ? 31536000000 : 0
    );
    const fromMs = Date.now() + fromValue * unitMs;
    const toMs = Date.now() + toValue * unitMs;

    let active = 0;
    for(let m of this.measures) {
      if(m.enabled) {
        m.nav = active == 0;
        m.right = (active++ % 2) != 0;
      }
    }

    // @ts-ignore

    const yAxis: YAxisOptions[] = [];
    for(let axis = 0; axis < this.filtered_measures.length; axis++) {
      let measure = this.filtered_measures[axis]

      yAxis.push({
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
        visible: (this.spacer?.nativeElement.offsetWidth || 0) > 320 ? measure.enabled : false,
        zoomEnabled: false,
      })

      measure.axis = axis;
    }

    const series = await Promise.all(this.filtered_measures.map(async (measure:any):Promise<Highcharts.SeriesOptionsType & { data: [[number, number]] }> => {
      const requestedMeasure = measure.name + (measure.name === 'vpd' && this.vpdMode !== 'all' ? `_${this.vpdMode}` : '');
      let data = measure.enabled ? await this.data.getSeries(this.device_id, requestedMeasure, from, this.selectedInterval, to) : []

      if (data.length > 0 && data[data.length - 1][1] === null) {
        data.pop();
      }

      data = data.sort((a: any, b: any) => a[0] - b[0]);

      return {
        name: measure.title,
        type: "area",
        data,
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

    const deviceLogs = this.showLogs ? await this.devices.getLogs(this.device_id, fromMs, toMs, true) : [];


    [0, 1, 2].forEach(severity => {
      const logs = deviceLogs
        .filter(log => log.severity === severity)
        .filter(log => !this.selectedLogCategory || this.selectedLogCategory === 'all' || log.categories?.includes(this.selectedLogCategory));

      series.push({
        name: severity == 2 ? 'Critical logs' : (severity == 1 ? 'Warning logs' : 'Info logs'),
        type: 'column',
        data: logs.map(log => [Date.parse(log.time), 1]) as [[number, number]],
        yAxis: yAxis.length,
        color: severity == 2 ? 'crimson' : (severity == 1 ? 'orange' : 'dodgerblue'),
        visible: true,
        grouping: true,
        states: {
          inactive: {
            opacity: 0.6,
          }
        }
      });

      yAxis.push({
        min: 0,
        softMax: 1,
        visible: false,
        zoomEnabled: false,
      });
    });

    if (this.currentDataLoadStartTime !== thisDataLoadStartTime) {
      return;
    }

    this.deviceLogs = deviceLogs;
    this.deviceLogCategories.clear();
    this.deviceLogs.forEach(log =>
      log.categories?.forEach(category => this.deviceLogCategories.add(category))
    );

    // @ts-ignore
    this.chartOptions.chart.animation = !this.autoUpdate;
    this.chartOptions.yAxis = yAxis;
    this.chartOptions.series = series;
    this.updateFlag = true;
    this.loaded = true;

    // this.lineChartData.datasets[1].data = await this.data.getSeries(room_id, 'humidity', span, interval);
    // this.lineChartData.datasets[2].data = await this.data.getSeries(room_id, 'co2', span, interval);
    // this.chart?.update();

    this.currentImageTimestamp = series?.[0]?.data?.[(series?.[0]?.data?.length ?? 1) - 1]?.[0];
    void this.loadDeviceImage(this.currentImageTimestamp);
    if (this.showLightOffsetControls() && this.showImage && !this.selectedTimespan.imageIntervalMs) {
      this.selectedTimespan = this.getAvailableTimespans()[0];
    }

    this.filterLogs();
  }

  public hasEnabledMeasures() {
    return Boolean(this.filtered_measures.find(m => m.enabled));
  }

  public prevOffset() {
    this.offset--;
    this.offsetChanged();
  }

  public nextOffset() {
    this.offset++;
    this.offsetChanged();
  }

  toggleAutoUpdate() {
    this.autoUpdate = !this.autoUpdate;
    this.offsetChanged();
  }

  public offsetChanged() {
    this.selectedLogs.splice(0, this.selectedLogs.length);
    this.loadData().then(() => {
      this.chartInstance?.zoomOut();

      if (this.isAnimatedImage()) {
        this.currentImageTimestamp = Math.ceil(Date.now() / 5000) * 5000 + this.offset * (this.selectedTimespan?.imageIntervalMs ?? 0);
        void this.loadDeviceImage(this.currentImageTimestamp);
      }
    });
  }

  public intervalChanged() {
    void this.loadData();
  }

  public timespanChanged() {
    this.offset = 0;
    this.selectedInterval = this.selectedTimespan.defaultInterval;
    this.selectedLogs.splice(0, this.selectedLogs.length);
    this.loadData().then(() => this.chartInstance?.zoomOut());
  }

  public vpdModeChanged() {
    void this.loadData();
  }

  public isMeasureEnabled(measure: string) {
    return this.measures.find(m => m.name === measure)?.enabled;
  }

  public toggleMeasure(measure:any) {
    measure.enabled = !measure.enabled;

    if (!this.hasEnabledMeasures()) {
      this.selectedLogs.splice(0, this.selectedLogs.length);
    }

    this.loadData().then(() => {
      this.redrawChart();
    });
  }

  public onChartInstance(chart: Highcharts.Chart) {
    this.chartInstance = chart;
  }

  public showLightOffsetControls(): boolean {
    return (this.showImage || this.showLogs) && !this.autoUpdate && !this.hasEnabledMeasures();
  }

  async loadDeviceImage(timestamp?: number): Promise<void> {
    if (!this.showImage) {
      return;
    }

    let format: 'mp4' | 'jpeg';
    let duration: string | undefined;
    if (this.isAnimatedImage()) {
      format = 'mp4';
      duration = this.selectedTimespan.name;
    } else {
      format = 'jpeg';
    }

    const url = await this.devices.getDeviceImageUrl(this.device_id, format, timestamp, duration);

    if (url && this.currentImageTimestamp === timestamp) {
      this.deviceImageUrl = url;
    }
  }

  isAnimatedImage(): boolean {
    return this.showImage && !this.hasEnabledMeasures() && !this.autoUpdate;
  }

  toggleShowImage() {
    this.showImage = !this.showImage;
    this.redrawChart();
  }

  toggleShowLogs() {
    this.showLogs = !this.showLogs;
    this.selectedLogs.splice(0, this.selectedLogs.length);
    void this.loadData().then(() =>
      this.redrawChart()
    );
  }

  filterLogs() {
    const getFilteredLogs = (ignoreSelection?: boolean): (DeviceLog & { count?: number; })[] => {
      let result: (DeviceLog & { count?: number; })[] = this.deviceLogs.filter(log => {

        const anyLogSelected = ignoreSelection ? false : this.selectedLogs.length > 0;
        const anyCategorySelected = this.selectedLogCategory && this.selectedLogCategory !== 'all'
        const thisLogSelected = anyLogSelected && this.selectedLogs.find(selectedLog => selectedLog._id === log._id);
        const thisCategorySelected = anyCategorySelected && log.categories?.includes(this.selectedLogCategory);

        if (thisLogSelected) {
          return true;
        }

        return !anyLogSelected && (!anyCategorySelected || thisCategorySelected);
      });

      const originalResult = result;
      result = [];
      let count = 0;
      for (let i = 0; i < originalResult.length; i++) {
        const thisLog = originalResult[i];
        const nextLog = i < originalResult.length - 1 ? originalResult[i + 1] : undefined;
        count++;

        // de-duplicate lines
        if (thisLog?.title !== nextLog?.title || thisLog?.message !== nextLog?.message || thisLog?.severity !== nextLog?.severity || thisLog?.raw !== nextLog?.raw) {
          result.push({
            ...thisLog,
            count,
          });
          count = 0;
        }
      }

      if (this.autoUpdate) {
        return result.reverse();
      } else {
        return result;
      }
    }

    this.filteredLogs = getFilteredLogs();
    this.filteredLogsSelectionFiltered = this.filteredLogs.length < getFilteredLogs(true).length;
  }

  logCategoryChanged() {
    this.selectedLogs.splice(0, this.selectedLogs.length);
    void this.loadData();
  }

  private redrawChart() {
    this.chartInstance.reflow();
    this.chartInstance.redraw();
    window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      void this.loadDeviceImage(this.currentImageTimestamp);
    }, 10);
  }
}
