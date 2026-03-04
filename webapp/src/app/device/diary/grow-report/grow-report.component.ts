import {Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from '@angular/core';
import {DeviceLog, DeviceService} from "../../../services/devices.service";
import {Subscription} from "rxjs";
import {DiaryEntryData} from "../diary-entry-modal/diary-entry-modal.component";

export const LIFECYCLE_EVENT_ORDER: Record<DiaryEntryData['newLifecycleStage'], number> = {
  germination: 0,
  seedling: 1,
  vegetative: 2,
  flowering: 3,
  drying: 4,
  curing: 5,
} as const;

export type GrowCycle = {
  name: string;
  timestampStart: Date;
  timestampEnd?: Date;
  events: Partial<Record<DiaryEntryData['newLifecycleStage'], DeviceLog>>;
}

@Component({
  selector: 'app-grow-report',
  templateUrl: './grow-report.component.html',
  styleUrls: ['./grow-report.component.scss'],
})
export class GrowReportComponent implements OnInit, OnDestroy, OnChanges {
  @Input() deviceId = '';
  @Input() lastUpdated: number | undefined;

  private devicesSubscription: Subscription | undefined;

  public growCycles: GrowCycle[] = [];
  public selectedCycleIndex: number = 0;

  constructor(private devices: DeviceService) {
  }

  ngOnInit() {
    this.devicesSubscription = this.devices.devices.subscribe(async() => {
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
    const entries = await this.devices.getLogs(this.deviceId, undefined, undefined, true, ['plant-lifecycle']);
    this.growCycles = this.convertEventsToGrowCycles(entries);
  }

  private convertEventsToGrowCycles(entries: DeviceLog[]): GrowCycle[] {
    const cycles: GrowCycle[] = [];

    let previousLifecycleOrder = Number.MAX_SAFE_INTEGER;
    for (const entry of entries) {
      if (!entry.data?.newLifecycleStage) {
        continue;
      }

      const lifecycleOrder = LIFECYCLE_EVENT_ORDER[entry.data.newLifecycleStage];
      if (previousLifecycleOrder >= lifecycleOrder) {
        cycles.unshift({
          timestampStart: new Date(entries[0].time),
          timestampEnd: entries.length > 1 ? new Date(entries[entries.length - 1].time) : undefined,
          events: {},
          name: '',
        });
      }

      cycles[0].events[entry.data.newLifecycleStage] = entry;
      if (!cycles[0].name) {
        cycles[0].name = entry.data.lifecycleName || '';

      }
      previousLifecycleOrder = lifecycleOrder;
    }

    for (let i = 0; i < cycles.length; i++) {
      if (!cycles[i].name) {
        cycles[i].name = 'My Strain ' + (i + 1);
      }
    }

    return cycles;
  }


  get selectedCycle(): GrowCycle | undefined {
    return this.growCycles.length > 0 ? this.growCycles[Math.min(this.selectedCycleIndex, this.growCycles.length - 1)] : undefined;
  }

  get selectedCycleEventsOrdered(): Array<{stage: DiaryEntryData['newLifecycleStage']; event: DeviceLog; dayCount: number; untilNow?: boolean}> {
    if (!this.selectedCycle) {
      return [];
    }

    const orderedEvents = (Object.entries(this.selectedCycle.events) as Array<[DiaryEntryData['newLifecycleStage'], DeviceLog | undefined]>)
      .filter(([, event]) => !!event)
      .sort(([stageA], [stageB]) => LIFECYCLE_EVENT_ORDER[stageA] - LIFECYCLE_EVENT_ORDER[stageB])
      .map(([stage, event]) => ({stage, event: event as DeviceLog}));

    return orderedEvents.map((item, index) => {
      const currentDate = new Date(item.event.time);
      const nextDate = index < orderedEvents.length - 1
        ? new Date(orderedEvents[index + 1].event.time)
        : new Date(); // Today for the last stage

      const dayCount = this.calculateDayCount(currentDate, nextDate);
      const daysUntilNow = index === orderedEvents.length - 1 ? dayCount : undefined;

      return {
        ...item,
        dayCount,
        untilNow: daysUntilNow !== undefined,
      };
    });
  }

  private calculateDayCount(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Reset time to midnight to count full days
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  onCycleSelected(event: any) {
    this.selectedCycleIndex = event.detail.value;
  }
}
