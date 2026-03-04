import {Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from '@angular/core';
import {DeviceLog, DeviceService} from "../../../services/devices.service";
import {Subscription} from "rxjs";
import {DataService} from "../../../services/data.service";

type CylinderData = {
  timestampStart: Date;
  timestampEnd: Date;
  fillingStart: number;
  fillingEnd?: number;
  ticksReleased?: number;
  ticksPerFilling?: number;
}

@Component({
  selector: 'app-co2-report',
  templateUrl: './co2-report.component.html',
  styleUrls: ['./co2-report.component.scss'],
})
export class Co2ReportComponent implements OnInit, OnDestroy, OnChanges {
  @Input() deviceId = '';
  @Input() cloudSettings: any = {};
  @Input() lastUpdated: number | undefined;

  private devicesSubscription: Subscription | undefined;

  public cylinders: CylinderData[] = [];

  public averageTicksPerFilling: number | undefined = undefined;

  constructor(private devices: DeviceService, private data: DataService) {
  }

  ngOnInit() {
    this.devicesSubscription = this.devices.devices.subscribe(async(devices) => {
      const device = devices.find((device) => device.device_id === this.deviceId);
      this.cloudSettings = device?.cloudSettings ?? {};
      void this.loadData();
    });
  }

  ngOnDestroy() {
    this.devicesSubscription?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['lastUpdated'] && !changes['lastUpdated'].firstChange) {
      void this.loadData();
    }
  }

  async loadData() {
    const entries = await this.devices.getLogs(this.deviceId, undefined, undefined, true, ['co2-refill']);
    void this.parseEntries(entries);
  }

  async parseEntries(entries: DeviceLog[]): Promise<void> {
    this.cylinders = [];

    for (const entry of entries) {
      const lastCylinder = this.cylinders.length > 0 ? this.cylinders[0] : null;
      if (lastCylinder) {
        lastCylinder.fillingEnd = entry.data?.co2FillingRest ?? lastCylinder.fillingEnd ?? 0;
        lastCylinder.timestampEnd = new Date(entry.time);
      }

      this.cylinders.unshift({
        timestampStart: new Date(entry.time),
        timestampEnd: new Date(),
        fillingStart: entry.data?.co2FillingInitial ?? 425,
      });
    }

    this.averageTicksPerFilling = undefined;
    for (const cylinder of this.cylinders) {
      try {
        const interval = Math.floor((cylinder.timestampEnd.getTime() - cylinder.timestampStart.getTime()) / 1000) + 's';
        const series = await this.data.getSeries(this.deviceId, 'out_co2', String(cylinder.timestampStart.toISOString()), interval, String(cylinder.timestampEnd?.toISOString()), 'sum')
        cylinder.ticksReleased = series.reduce((sum, point) => sum + (point?.[1] ?? 0), 0);

        if (cylinder.fillingEnd !== undefined) {
          cylinder.ticksPerFilling = (cylinder.ticksReleased ?? 0) / (cylinder.fillingStart - cylinder.fillingEnd);

          // Now we update the average to show data while loading
          const cylindersWithRealData = this.cylinders.filter(c =>
            c.fillingStart !== undefined && c.fillingEnd !== undefined && c.ticksPerFilling !== undefined && c.ticksPerFilling > 0
          );
          const totalCo2Used = cylindersWithRealData.reduce(
            (sum, c) => sum + ((c.fillingStart - (c.fillingEnd ?? c.fillingStart)) ?? 0),
            0
          );
          const totalTicksReleased = cylindersWithRealData.reduce(
            (sum, c) => sum + (c.ticksReleased ?? 0),
            0
          );
          this.averageTicksPerFilling = totalTicksReleased / totalCo2Used;
        }
      } catch (e) {
        console.log('Error fetching series for cylinder', cylinder, e);
      }
    }


    this.cylinders.filter(cylinder => cylinder.fillingEnd === undefined).forEach(cylinder =>
      cylinder.fillingEnd = cylinder.fillingStart - (cylinder.ticksReleased ?? 0) / (this.averageTicksPerFilling ?? 0)
    );
  }

  protected readonly NaN = NaN;
}

