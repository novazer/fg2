import {Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ChartType} from 'chart.js';
import {BaseChartDirective} from 'ng2-charts';
import 'chartjs-adapter-luxon';
import {ActivatedRoute, Router} from '@angular/router';
import {DataService} from 'src/app/services/data.service';
import * as Highcharts from 'highcharts/highstock';
import {YAxisOptions} from 'highcharts/highstock';
import {DeviceService} from 'src/app/services/devices.service';
import {IonModal} from "@ionic/angular";
import {collectLogCategories, matchesLogCategory,} from '../log-entry-viewer/log-entry-viewer.component';
import type { DeviceLog } from '@fg2/shared-types';

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

type ChartTheme = {
  isDark: boolean;
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  gridLineColor: string;
  axisLineColor: string;
  tooltipBackground: string;
  tooltipBorder: string;
  navigatorMaskFill: string;
  navigatorOutlineColor: string;
  navigatorSeriesColor: string;
  navigatorSeriesFill: string;
  rangeButtonFill: string;
  rangeButtonStroke: string;
  rangeButtonText: string;
  rangeButtonHoverFill: string;
  rangeButtonSelectedFill: string;
  noDataColor: string;
  measureColorOverrides: Record<string, string>;
  logColors: {
    info: string;
    warning: string;
    critical: string;
  };
};

@Component({
  selector: 'app-charts',
  templateUrl: './charts.page.html',
  styleUrls: ['./charts.page.scss'],
})
export class ChartsPage implements OnInit, OnDestroy {
  Highcharts: typeof Highcharts = Highcharts;
  updateFlag: boolean = false;
  chartOptions: Highcharts.Options;

  private themeObserver?: MutationObserver;

  public timespans = [
    {name: '20m', durationValue: 20, durationUnit: 'm', defaultInterval: '5s'},
    {name: '1h', durationValue: 1, durationUnit: 'h', defaultInterval: '10s', highlight: true},
    {name: '6h', durationValue: 6, durationUnit: 'h', defaultInterval: '10s'},
    {name: '12h', durationValue: 12, durationUnit: 'h', defaultInterval: '10s'},
    {
      name: '1d',
      durationValue: 24,
      durationUnit: 'h',
      defaultInterval: '20s',
      highlight: true,
      imageIntervalMs: 86400000
    },
    {name: '3d', durationValue: 3, durationUnit: 'd', defaultInterval: '1m', highlight: true},
    {
      name: '1w',
      durationValue: 7,
      durationUnit: 'd',
      defaultInterval: '15m',
      highlight: true,
      imageIntervalMs: 7 * 86400000
    },
    {name: '2w', durationValue: 14, durationUnit: 'd', defaultInterval: '30m'},
    {
      name: '1m',
      durationValue: 30,
      durationUnit: 'd',
      defaultInterval: '1h',
      highlight: true,
      imageIntervalMs: 30 * 86400000
    },
    {name: '3m', durationValue: 90, durationUnit: 'd', defaultInterval: '4h'},
    {name: '6m', durationValue: 180, durationUnit: 'd', defaultInterval: '1d'},
    {name: '1y', durationValue: 1, durationUnit: 'y', defaultInterval: '1w'},
    {name: '3y', durationValue: 3, durationUnit: 'y', defaultInterval: '1w'},
  ];

  public intervals = ['5s', '10s', '20s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

  public selectedTimespan = this.timespans.find(ts => ts.name === '1d')!;

  public selectedInterval = this.selectedTimespan.defaultInterval;

  public measures = [
    {
      title: 'Temperature',
      icon: 'temperature',
      color: '#f00',
      name: 'temperature',
      txt: 'T',
      unit: '°C',
      enabled: true,
      right: false,
      nav: false,
      types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer', 'controller'],
      max: 30
    },
    // { title: 'AVG', icon: 'temperature', color: '#f00', name: 'avg', txt: 'avg', unit: '°C', enabled: true, right: false, nav: false, types: ['fridge']},
    { title: 'Humidity', icon: 'humidity', color: '#00f', name: 'humidity', txt: 'H', unit: '%', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer', 'controller'], max: 100},
    { title: 'VPD', icon: 'vpd', color: '#0f0', name: 'vpd', txt: 'V', unit: 'kPa', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'fan', 'light', 'plug', 'dryer', 'controller'], max: 1.6},
    { title: 'CO2', icon: 'co2', color: '#000', name: 'co2', txt: 'CO2', unit: 'ppm', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'plug', 'controller'], max: 1},
    { title: 'Heater', icon: 'heating', color: '#f00', name: 'out_heater', txt: 'T', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'dryer', 'controller'], max: 1},
    // { title: 'P', icon: 'heating', color: '#f00', name: 'p', txt: 'P', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'I', icon: 'heating', color: '#f00', name: 'i', txt: 'I', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    // { title: 'D', icon: 'heating', color: '#f00', name: 'd', txt: 'D', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'foo']},
    { title: 'Dehumidifier', icon: 'dehumidify', color: '#00f', name: 'out_dehumidifier', txt: 'H', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'dryer', 'controller'], max: 1},
    { title: 'Fan', icon: 'fan_out', color: '#00f', name: 'out_fan', txt: 'Fan', unit: '%', enabled: false, right: false, nav: false, types: ['fan'], max: 1},
    { title: 'CO2 Valve', icon: 'co2_valve', color: '#000', name: 'out_co2', txt: 'CO2 Valve', unit: ' ticks', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'controller'], method: 'sum'},
    { title: 'Lights', icon: 'light', color: '#000', name: 'out_light', txt: 'Lights', unit: '', enabled: false, right: false, nav: false, types: ['fridge', 'fridge2', 'light', 'controller'], max: 100},
    { title: 'Day', icon: 'light', color: '#000', name: 'day', txt: 'Day', unit: '', enabled: false, right: false, nav: false, types: ['fan'], max: 1},
    { title: 'Fan (internal)', icon: 'fan_internal', color: 'orange', name: 'out_fan-internal', txt: 'fan-internal', unit: '',  enabled: false, right: false, nav: false, types: ['fridge', 'fridge2'], max: 1},
    { title: 'Fan (external)', icon: 'fan_external', color: 'yellow', name: 'out_fan-external', txt: 'fan-external', unit: '',  enabled: false, right: false, nav: false, types: ['fridge', 'fridge2'], max: 1},
    { title: 'Fan (backwall)', icon: 'fan_backwall', color: 'pink', name: 'out_fan-backwall', txt: 'fan-backwall', unit: '',  enabled: false, right: false, nav: false, types: ['fridge', 'fridge2'], max: 1},
  ];


  public filtered_measures: any[] = [];

  public lineChartType: ChartType = 'line';
  public start_ts = 0;
  public end_ts = 0;

  public loaded = false;
  public device_id: string = "";
  public device_type: string = "";
  public cloudSettings: any = {};
  public isPublic = false;

  public autoUpdate: boolean = false;

  // Empty date means live mode: start is now minus the selected timespan.
  public selectedDate: string = '';

  // If set, the chart shows a fixed range from selectedDate to selectedDateEnd.
  // Timespan/date controls are hidden in this mode.
  public selectedDateEnd: string = '';

  public vpdMode: 'all' | 'day' | 'night' = 'all';

  public useCustom = false;

  public showImage = false;

  public showLogs = false;

  @ViewChild('chartsDateModal') chartsDateModal!: IonModal;

  public deviceLogs: DeviceLog[] = [];

  public filteredLogs: (DeviceLog & { count?: number; })[] = [];

  public filteredLogsSelectionFiltered: boolean = false;

  public filteredLogsUngroupedCount: number = 0;

  public deviceLogCategories: string[] = [];

  public selectedLogCategories: string[] = [];

  public groupLogs: boolean = true;

  public deviceImageUrl: string | undefined = undefined;

  public chartInstance!: Highcharts.Chart;

  public currentImageTimestamp: number | undefined = undefined;

  private currentDataLoadStartTime: number = 0;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('spacer') spacer?: ElementRef;

  private interval?: NodeJS.Timeout;

  public selectedLogs: DeviceLog[] = [];

  constructor(private route: ActivatedRoute, private router: Router, private data: DataService, private devices: DeviceService) {
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
                  this.selectedLogs.push(...this.deviceLogs.filter(log => timestamps.includes(log.time.getTime())));
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

    this.applyChartTheme();
  }

  private isDarkModeEnabled(): boolean {
    const bodyDark = document.body.classList.contains('dark');
    const stored = localStorage.getItem('app-dark-mode');
    return bodyDark || stored === 'true';
  }

  private getChartTheme(): ChartTheme {
    if (!this.isDarkModeEnabled()) {
      return {
        isDark: false,
        backgroundColor: '#ffffff',
        textColor: '#1f2430',
        mutedTextColor: '#5d6678',
        gridLineColor: '#e3e7ef',
        axisLineColor: '#c8cfda',
        tooltipBackground: '#ffffff',
        tooltipBorder: '#ced4e0',
        navigatorMaskFill: 'rgba(125, 140, 170, 0.2)',
        navigatorOutlineColor: '#c8cfda',
        navigatorSeriesColor: '#4f74d9',
        navigatorSeriesFill: 'rgba(79, 116, 217, 0.12)',
        rangeButtonFill: '#f3f5f9',
        rangeButtonStroke: '#cfd6e2',
        rangeButtonText: '#283044',
        rangeButtonHoverFill: '#e7ebf3',
        rangeButtonSelectedFill: '#d8e0ef',
        noDataColor: '#5d6678',
        measureColorOverrides: {},
        logColors: {
          info: '#1e78d5',
          warning: '#d99212',
          critical: '#d0344f',
        }
      };
    }

    return {
      isDark: true,
      backgroundColor: '#161a22',
      textColor: '#e7ecf5',
      mutedTextColor: '#b8c1d4',
      gridLineColor: '#313a4a',
      axisLineColor: '#4a5568',
      tooltipBackground: '#1d2330',
      tooltipBorder: '#3b475c',
      navigatorMaskFill: 'rgba(122, 138, 172, 0.28)',
      navigatorOutlineColor: '#58657d',
      navigatorSeriesColor: '#8fb0ff',
      navigatorSeriesFill: 'rgba(143, 176, 255, 0.2)',
      rangeButtonFill: '#232a38',
      rangeButtonStroke: '#424f66',
      rangeButtonText: '#dde5f4',
      rangeButtonHoverFill: '#2f3a4f',
      rangeButtonSelectedFill: '#3a4862',
      noDataColor: '#b8c1d4',
      measureColorOverrides: {
        co2: '#b7c6ff',
        out_co2: '#b7c6ff',
        out_light: '#f3e27b',
        day: '#f3e27b',
        'out_fan-external': '#ffe082',
      },
      logColors: {
        info: '#6db3ff',
        warning: '#ffbe55',
        critical: '#ff7486',
      }
    };
  }

  private applyChartTheme() {
    const theme = this.getChartTheme();

    this.chartOptions = {
      ...this.chartOptions,
      chart: {
        ...this.chartOptions.chart,
        backgroundColor: theme.backgroundColor,
        plotBackgroundColor: theme.backgroundColor,
        style: {
          color: theme.textColor,
        }
      },
      xAxis: {
        type: 'datetime',
        lineColor: theme.axisLineColor,
        tickColor: theme.axisLineColor,
        gridLineColor: theme.gridLineColor,
        labels: {
          style: {
            color: theme.mutedTextColor,
          }
        },
        title: {
          style: {
            color: theme.textColor,
          }
        }
      },
      legend: {
        itemStyle: {
          color: theme.textColor,
        },
        itemHoverStyle: {
          color: theme.textColor,
        },
        itemHiddenStyle: {
          color: theme.mutedTextColor,
        }
      },
      tooltip: {
        backgroundColor: theme.tooltipBackground,
        borderColor: theme.tooltipBorder,
        style: {
          color: theme.textColor,
        }
      },
      rangeSelector: {
        ...this.chartOptions.rangeSelector,
        buttonTheme: {
          fill: theme.rangeButtonFill,
          stroke: theme.rangeButtonStroke,
          r: 4,
          style: {
            color: theme.rangeButtonText,
          },
          states: {
            hover: {
              fill: theme.rangeButtonHoverFill,
              style: {
                color: theme.textColor,
              }
            },
            select: {
              fill: theme.rangeButtonSelectedFill,
              style: {
                color: theme.textColor,
              }
            }
          }
        },
        labelStyle: {
          color: theme.mutedTextColor,
        },
      },
      navigator: {
        ...this.chartOptions.navigator,
        maskFill: theme.navigatorMaskFill,
        outlineColor: theme.navigatorOutlineColor,
        series: {
          color: theme.navigatorSeriesColor,
          fillOpacity: 0.2,
          fillColor: theme.navigatorSeriesFill,
          lineColor: theme.navigatorSeriesColor,
        },
        xAxis: {
          lineColor: theme.axisLineColor,
          tickColor: theme.axisLineColor,
          gridLineColor: theme.gridLineColor,
          labels: {
            style: {
              color: theme.mutedTextColor,
            }
          }
        },
        yAxis: {
          gridLineColor: theme.gridLineColor,
        }
      },
      noData: {
        style: {
          color: theme.noDataColor,
        }
      },
    };

    this.updateFlag = true;
  }

  ngOnInit() {
    this.device_id = this.route.snapshot.paramMap.get('device_id') || '';
    if (this.route.snapshot.queryParams?.['measures']) {
      const selectedMeasures = String(this.route.snapshot.queryParams['measures']).split(',');
      this.measures.forEach(measure => measure.enabled = selectedMeasures.includes(measure.name));
      this.showImage = selectedMeasures.includes('image');
      this.showLogs = selectedMeasures.includes('logs');
    }
    if (this.route.snapshot.queryParams?.['vpdMode']) {
      this.vpdMode = this.route.snapshot.queryParams['vpdMode'] as 'all' | 'day' | 'night';
    }
    if (this.route.snapshot.queryParams?.['autoUpdate']) {
      this.autoUpdate = this.route.snapshot.queryParams['autoUpdate'] === 'true';
    }
    if (this.route.snapshot.queryParams?.['useCustom']) {
      this.useCustom = this.route.snapshot.queryParams['useCustom'] === 'true';
    }
    if (this.route.snapshot.queryParams?.['timespan']) {
      this.selectedTimespan = this.timespans.find(ts => ts.name === this.route.snapshot.queryParams['timespan'])!;
      this.selectedInterval = this.selectedTimespan.defaultInterval;
    }
    if (this.route.snapshot.queryParams?.['interval']) {
      this.selectedInterval = this.route.snapshot.queryParams['interval'];
    }
    if (this.route.snapshot.queryParams?.['date']) {
      this.selectedDate = this.route.snapshot.queryParams['date'];
    } else {
      this.selectedDate = '';
    }
    if (this.route.snapshot.queryParams?.['dateEnd']) {
      this.selectedDateEnd = this.route.snapshot.queryParams['dateEnd'];
    } else {
      this.selectedDateEnd = '';
    }
    if (this.route.snapshot.queryParams?.['logs']) {
      this.selectedLogCategories = String(this.route.snapshot.queryParams['logs']).split(',');
    }

    if (this.selectedDate) {
      this.autoUpdate = false;
    }

    this.themeObserver = new MutationObserver(() => {
      this.applyChartTheme();
      this.redrawChart();
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    void this.devices.resolveDeviceAccessInfo(this.device_id)
      .then(deviceAccessInfo => {
        this.isPublic = deviceAccessInfo.isPublic;
        this.device_type = deviceAccessInfo.device_type || '';
        this.cloudSettings = deviceAccessInfo.cloudSettings || {};

        if (this.device_type != "") {
          this.filtered_measures = this.measures
            .filter((measure) => measure.types.includes(this.device_type));

          if (!this.cloudSettings.rtspStream) {
            this.showImage = false;
          }

          setTimeout(() => this.loadData(), 10)
          if (this.interval) {
            clearInterval(this.interval);
          }

          this.interval = setInterval(() => {
            if (this.autoUpdate) {
              this.selectedDate = '';
              this.currentImageTimestamp = undefined;
              this.selectedLogs.splice(0, this.selectedLogs.length);
              void this.loadDeviceImage();
              void this.loadData();
            }
          }, 10000)
        }
      })
      .catch(() => {
        this.loaded = true;
      });
  }

  ngOnDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    this.themeObserver?.disconnect();
    this.themeObserver = undefined;

  }

  public getAvailableTimespans() {
    const showImageControls = this.showLightOffsetControls() && this.showImage;
    return this.timespans.filter(ts => !showImageControls || ts.imageIntervalMs);
  }

  public hasFixedDateRange(): boolean {
    return !!this.selectedDate && !!this.selectedDateEnd;
  }

  private getSelectedTimespanDurationMs() {
    // When dateEnd is set, calculate duration from date range
    if (this.selectedDateEnd) {
      const startMs = Date.parse(this.selectedDate);
      const endMs = Date.parse(this.selectedDateEnd);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        return endMs - startMs;
      }
    }

    const unitMs = (
      this.selectedTimespan.durationUnit === 'm' ? 60000 :
        this.selectedTimespan.durationUnit === 'h' ? 3600000 :
          this.selectedTimespan.durationUnit === 'd' ? 86400000 :
            this.selectedTimespan.durationUnit === 'y' ? 31536000000 : 0
    );

    return this.selectedTimespan.durationValue * unitMs;
  }

  private getSelectedDateMs() {
    const selectedDateMs = Date.parse(this.selectedDate);
    if (!Number.isNaN(selectedDateMs)) {
      return selectedDateMs;
    }

    // Empty/invalid date means a live window ending now.
    return Date.now() - this.getSelectedTimespanDurationMs();
  }

  private clampSelectedDateToNow() {
    if (!this.selectedDate) {
      return;
    }

    const latestAllowedStartMs = Date.now() - this.getSelectedTimespanDurationMs();
    if (this.getSelectedDateMs() > latestAllowedStartMs) {
      this.selectedDate = new Date(latestAllowedStartMs).toISOString();
    }
  }

  private shiftSelectedDateByTimespan(direction: -1 | 1) {
    const durationMs = this.getSelectedTimespanDurationMs();
    if (durationMs <= 0) {
      return;
    }

    const shiftedMs = this.getSelectedDateMs() + direction * durationMs;
    this.selectedDate = new Date(shiftedMs).toISOString();
    this.clampSelectedDateToNow();
  }

  public dateChanged(dateModal?: { dismiss: () => Promise<boolean> }) {
    this.clampSelectedDateToNow();
    this.autoUpdate = !this.selectedDate && this.autoUpdate;
    this.offsetChanged();
    void dateModal?.dismiss();
  }

  public openDateModal(): Promise<void> {
    return this.chartsDateModal.present();
  }

  private async loadData() {
    const thisDataLoadStartTime = this.currentDataLoadStartTime = Date.now();
    const theme = this.getChartTheme();

    if (this.autoUpdate) {
      this.selectedDate = '';
    }

    this.clampSelectedDateToNow();

    const fromMs = this.getSelectedDateMs();
    const toMs = fromMs + this.getSelectedTimespanDurationMs();
    const from = new Date(fromMs).toISOString();
    const to = new Date(toMs).toISOString();

    let active = 0;
    for (let m of this.measures) {
      if (m.enabled) {
        m.nav = active == 0;
        m.right = (active++ % 2) != 0;
      }
    }

    // @ts-ignore

    const yAxis: YAxisOptions[] = [];
    for (let axis = 0; axis < this.filtered_measures.length; axis++) {
      let measure = this.filtered_measures[axis]
      const measureColor = theme.measureColorOverrides[measure.name] ?? measure.color;

      yAxis.push({
        labels: {
          format: '{value}' + measure.unit,
          style: {
            color: measureColor,
            fontSize: '8px'
          }
        },
        softMin: 0,
        softMax: measure.max,
        opposite: measure.right,
        visible: (this.spacer?.nativeElement.offsetWidth || 0) > 320 ? measure.enabled : false,
        zoomEnabled: false,
        gridLineColor: theme.gridLineColor,
        lineColor: theme.axisLineColor,
        tickColor: theme.axisLineColor,
      })

      measure.axis = axis;
    }

    const series = await Promise.all(this.filtered_measures.map(async (measure: any): Promise<Highcharts.SeriesOptionsType & {
      data: [number, number][]
    }> => {
      const requestedMeasure = measure.name + (measure.name === 'vpd' && this.vpdMode !== 'all' ? `_${this.vpdMode}` : '');
      let data = measure.enabled ? await this.data.getSeries(this.device_id, requestedMeasure, from, this.selectedInterval, to, measure.method) : []

      if (data.length > 0 && data[data.length - 1][1] === null) {
        data.pop();
      }

      data = data.sort((a: any, b: any) => a[0] - b[0]);
      const measureColor = theme.measureColorOverrides[measure.name] ?? measure.color;

      return {
        name: measure.title,
        type: "area",
        data,
        yAxis: measure.axis,
        color: measureColor,
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
        .filter(log => matchesLogCategory(log, this.selectedLogCategories));

      series.push({
        name: severity == 2 ? 'Critical logs' : (severity == 1 ? 'Warning logs' : 'Info logs'),
        type: 'column',
        data: logs.map(log => [log.time.getTime(), 1]) as [[number, number]],
        yAxis: yAxis.length,
        color: severity == 2 ? theme.logColors.critical : (severity == 1 ? theme.logColors.warning : theme.logColors.info),
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
        gridLineColor: theme.gridLineColor,
        lineColor: theme.axisLineColor,
        tickColor: theme.axisLineColor,
      });
    });

    if (this.currentDataLoadStartTime !== thisDataLoadStartTime) {
      return;
    }

    this.deviceLogs.splice(0, this.deviceLogs.length);
    this.deviceLogs.push(...deviceLogs);
    this.deviceLogCategories = collectLogCategories(this.deviceLogs);

    // @ts-ignore
    this.chartOptions.chart.animation = !this.autoUpdate;
    this.applyChartTheme();
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

    this.groupLogs = true;
    this.filterLogs();

    const queryParams = {
      measures: [
        ...this.filtered_measures.filter(m => m.enabled).map(m => m.name),
        ...(this.showImage ? ['image'] : []),
        ...(this.showLogs ? ['logs'] : []),
      ].join(','),
      date: this.selectedDate ?? '',
      dateEnd: this.selectedDateEnd ?? '',
      vpdMode: this.isMeasureEnabled('vpd') ? this.vpdMode : '',
      autoUpdate: this.autoUpdate?.toString() ?? '',
      useCustom: this.useCustom?.toString() ?? '',
      timespan: this.selectedTimespan?.name ?? '',
      interval: this.selectedInterval ?? '',
      logs: this.showLogs ? this.selectedLogCategories.join(',') : '',
    };
    await this.router.navigate(['device', this.device_id, 'charts'], {queryParams, replaceUrl: true});
  }

  public hasEnabledMeasures() {
    return Boolean(this.filtered_measures.find(m => m.enabled));
  }

  public prevOffset() {
    this.autoUpdate = false;
    this.shiftSelectedDateByTimespan(-1);
    this.offsetChanged();
  }

  public nextOffset() {
    this.shiftSelectedDateByTimespan(1);
    this.offsetChanged();
  }

  toggleAutoUpdate() {
    this.autoUpdate = !this.autoUpdate;
    this.selectedDate = '';
    this.offsetChanged();
  }

  public offsetChanged() {
    this.clampSelectedDateToNow();
    this.selectedLogs.splice(0, this.selectedLogs.length);
    this.loadData().then(() => {
      this.chartInstance?.zoomOut();

      if (this.isAnimatedImage()) {
        this.currentImageTimestamp = Math.ceil(this.getSelectedDateMs() / 5000) * 5000;
        void this.loadDeviceImage(this.currentImageTimestamp);
      }
    });
  }

  public intervalChanged() {
    void this.loadData();
  }

  public timespanChanged() {
    this.selectedInterval = this.selectedTimespan.defaultInterval;
    this.clampSelectedDateToNow();
    this.selectedLogs.splice(0, this.selectedLogs.length);
    this.loadData().then(() => this.chartInstance?.zoomOut());
  }

  public vpdModeChanged() {
    void this.loadData();
  }

  public isMeasureEnabled(measure: string) {
    return this.measures.find(m => m.name === measure)?.enabled;
  }

  public toggleMeasure(measure: any) {
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
    void this.loadData().then(() =>
      this.redrawChart()
    );
  }

  toggleShowLogs() {
    this.showLogs = !this.showLogs;
    this.selectedLogs.splice(0, this.selectedLogs.length);
    void this.loadData().then(() =>
      this.redrawChart()
    );
  }

  filterLogs() {
    const getFilteredLogs = (ignoreSelection?: boolean, ignoreGrouping?: boolean): (DeviceLog & {
      count?: number;
    })[] => {
      let result: (DeviceLog & { count?: number; })[] = this.deviceLogs.filter(log => {

        const anyLogSelected = ignoreSelection ? false : this.selectedLogs.length > 0;
        const thisLogSelected = anyLogSelected && this.selectedLogs.find(selectedLog => selectedLog._id === log._id);

        if (thisLogSelected) {
          return true;
        }

        return !anyLogSelected && matchesLogCategory(log, this.selectedLogCategories);
      });

      const originalResult = result;
      result = [];
      let count = 0;
      for (let i = 0; i < originalResult.length; i++) {
        const thisLog = originalResult[i];
        const nextLog = i < originalResult.length - 1 ? originalResult[i + 1] : undefined;
        count++;

        // de-duplicate lines
        if (
          !this.groupLogs
          || ignoreGrouping
          || thisLog?.title !== nextLog?.title
          || thisLog?.message !== nextLog?.message
          || thisLog?.severity !== nextLog?.severity
          || thisLog?.raw !== nextLog?.raw
          || thisLog?.images?.length
          || thisLog?.data !== undefined
        ) {
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
    this.filteredLogsUngroupedCount = getFilteredLogs(undefined, true).length;
    this.filteredLogsSelectionFiltered = this.filteredLogs.length < getFilteredLogs(true).length;
  }

  logCategoryChanged(selectedCategories?: string[]) {
    this.selectedLogCategories = selectedCategories && selectedCategories.length > 0 ? selectedCategories : [];
    this.selectedLogs.splice(0, this.selectedLogs.length);
    void this.loadData();
  }

  disableLogGrouping() {
    this.groupLogs = false;
    this.filterLogs();
  }

  private redrawChart() {
    this.chartInstance?.reflow();
    this.chartInstance?.redraw();
    window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      void this.loadDeviceImage(this.currentImageTimestamp);
    }, 10);
  }
}
