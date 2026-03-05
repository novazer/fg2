import {Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from '@angular/core';
import {DeviceLog, DeviceService} from "../../../services/devices.service";
import {Subscription} from "rxjs";
import {DiaryEntryData, defaultDiaryEntries} from "../diary-entry-modal/diary-entry-modal.component";
import {collectLogCategories, filterLogsByCategory, LogEntryViewerLog} from "../../log-entry-viewer/log-entry-viewer.component";

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

type TimelineEvent = {
  log: LogEntryViewerLog;
  time: Date;
  stage: DiaryEntryData['newLifecycleStage'];
  isLifecycle: boolean;
};

type TimelineDayGroup = {
  dayKey: string;
  date: Date;
  dayNumberInCycle: number;
  events: TimelineEvent[];
  gapSincePreviousDays?: number;
  gapLabel?: string;
};

type TimelinePhaseGroup = {
  stage: DiaryEntryData['newLifecycleStage'];
  eventsByDay: TimelineDayGroup[];
};

type GrowCycleTimeline = GrowCycle & { phaseTimeline: TimelinePhaseGroup[] };

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
  public cycleTimelines: GrowCycleTimeline[] = [];
  public selectedCycleIndex: number = 0;
  public loading = false;
  public includeSystemEntries = false;
  public availableLogCategories: string[] = [];
  public selectedLogCategories: string[] = [];

  private allLogs: LogEntryViewerLog[] = [];
  private lifecycleLogs: LogEntryViewerLog[] = [];

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
    if ((changes['lastUpdated'] && !changes['lastUpdated'].firstChange)
      || (changes['deviceId'] && !changes['deviceId'].firstChange)) {
      void this.loadData();
    }
  }

  async loadData() {
    if (!this.deviceId) {
      this.growCycles = [];
      this.cycleTimelines = [];
      this.availableLogCategories = [];
      this.selectedLogCategories = [];
      return;
    }

    this.loading = true;
    try {
      const categories = this.includeSystemEntries
        ? undefined
        : ['plant-lifecycle', 'diary', ...Object.keys(defaultDiaryEntries)];

      const logs = await this.devices.getLogs(this.deviceId, undefined, undefined, true, categories);

      this.allLogs = logs;
      this.lifecycleLogs = logs.filter(log => this.isLifecycleLog(log) && !!log.data?.newLifecycleStage);
      this.growCycles = this.convertEventsToGrowCycles(this.lifecycleLogs);
      this.availableLogCategories = collectLogCategories(logs);
      this.ensureSelectedCategories();
      this.rebuildTimelines();
    } finally {
      this.loading = false;
    }
  }

  onIncludeSystemEntriesChange(): void {
    void this.loadData();
  }

  onCategoryChanged(selectedCategories?: string[]): void {
    this.selectedLogCategories = selectedCategories && selectedCategories.length > 0
      ? selectedCategories
      : (this.availableLogCategories.includes('diary') ? ['diary'] : []);
    this.rebuildTimelines();
  }

  private ensureSelectedCategories(): void {
    if (!this.availableLogCategories.length) {
      this.selectedLogCategories = [];
      return;
    }

    if (!this.selectedLogCategories.length || !this.selectedLogCategories.some(cat => this.availableLogCategories.includes(cat))) {
      this.selectedLogCategories = this.availableLogCategories.includes('diary') ? ['diary'] : [...this.availableLogCategories];
    }
  }

  private rebuildTimelines(): void {
    const filtered = filterLogsByCategory(this.allLogs, this.selectedLogCategories);
    const merged = this.mergeLifecycleLogs(filtered).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    this.cycleTimelines = this.growCycles.map((cycle, index) => this.buildTimelineForCycle(cycle, merged, index));
  }

  private mergeLifecycleLogs(logs: LogEntryViewerLog[]): LogEntryViewerLog[] {
    const merged: LogEntryViewerLog[] = [...logs] as LogEntryViewerLog[];
    const ids = new Set(merged.map(log => log._id));
    this.lifecycleLogs.forEach(log => {
      if (!ids.has(log._id)) {
        merged.push(log as LogEntryViewerLog);
      }
    });
    return merged;
  }

  private buildTimelineForCycle(cycle: GrowCycle, logs: LogEntryViewerLog[], cycleIndex: number): GrowCycleTimeline {
    const cycleStart = new Date(cycle.timestampStart);
    const cycleEnd = this.growCycles[cycleIndex + 1]?.timestampStart
      ? new Date(this.growCycles[cycleIndex + 1].timestampStart)
      : (cycle.timestampEnd ? new Date(cycle.timestampEnd) : undefined);

    const lifecycleEvents = this.lifecycleLogs
      .filter(log => this.isWithinCycle(log.time, cycleStart, cycleEnd) && log.data?.newLifecycleStage)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const eventsInCycle: TimelineEvent[] = logs
      .filter(log => this.isWithinCycle(log.time, cycleStart, cycleEnd))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map(log => ({
        log: log as LogEntryViewerLog,
        time: new Date(log.time),
        stage: this.getStageForTime(new Date(log.time), lifecycleEvents),
        isLifecycle: this.isLifecycleLog(log),
      }))
      .filter(item => !!item.stage) as TimelineEvent[];

    const phaseMap = new Map<DiaryEntryData['newLifecycleStage'], TimelinePhaseGroup>();
    const phaseTimeline: TimelinePhaseGroup[] = [];
    let previousDay: Date | undefined;

    for (const event of eventsInCycle) {
      const stage = event.stage as DiaryEntryData['newLifecycleStage'];
      let phaseGroup = phaseMap.get(stage);
      if (!phaseGroup) {
        phaseGroup = { stage, eventsByDay: [] };
        phaseMap.set(stage, phaseGroup);
        phaseTimeline.push(phaseGroup);
      }

      const dayKey = this.toDayKey(event.time);
      let dayGroup = phaseGroup.eventsByDay.find(day => day.dayKey === dayKey);
      if (!dayGroup) {
        const dayDate = this.toStartOfDay(event.time);
        const gapDays = previousDay ? this.calculateDayCount(previousDay, dayDate) : undefined;
        dayGroup = {
          dayKey,
          date: dayDate,
          dayNumberInCycle: this.calculateDayCount(this.toStartOfDay(cycleStart), dayDate) + 1,
          events: [],
          gapSincePreviousDays: gapDays,
          gapLabel: gapDays && gapDays > 0 ? this.formatGapLabel(gapDays) : undefined,
        };
        phaseGroup.eventsByDay.push(dayGroup);
        previousDay = dayDate;
      }

      dayGroup.events.push(event);
    }

    return {
      ...cycle,
      phaseTimeline,
    };
  }

  private isWithinCycle(time: string | number | Date, start: Date, end?: Date): boolean {
    const timestamp = new Date(time).getTime();
    const startTime = start.getTime();
    const endTime = end ? new Date(end).getTime() : undefined;

    return timestamp >= startTime && (endTime === undefined || timestamp < endTime);
  }

  private toDayKey(date: Date): string {
    return this.toStartOfDay(date).toISOString();
  }

  private toStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getStageForTime(time: Date, lifecycleEvents: DeviceLog[]): DiaryEntryData['newLifecycleStage'] | undefined {
    let currentStage = lifecycleEvents[0]?.data?.newLifecycleStage;

    for (const lifecycleEvent of lifecycleEvents) {
      const lifecycleTime = new Date(lifecycleEvent.time);
      if (lifecycleTime.getTime() <= time.getTime() && lifecycleEvent.data?.newLifecycleStage) {
        currentStage = lifecycleEvent.data.newLifecycleStage;
      } else {
        break;
      }
    }

    return currentStage;
  }

  private convertEventsToGrowCycles(entries: DeviceLog[]): GrowCycle[] {
    const sortedEntries = [...entries].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const cycles: GrowCycle[] = [];

    let previousLifecycleOrder = -1;
    let currentCycle: GrowCycle | null = null;

    for (const entry of sortedEntries) {
      const stage = entry.data?.newLifecycleStage;
      if (!stage) {
        continue;
      }

      const lifecycleOrder = LIFECYCLE_EVENT_ORDER[stage];
      const startNewCycle = currentCycle && lifecycleOrder <= previousLifecycleOrder;

      if (!currentCycle || startNewCycle) {
        if (currentCycle) {
          currentCycle.timestampEnd = new Date(entry.time);
        }

        currentCycle = {
          timestampStart: new Date(entry.time),
          timestampEnd: undefined,
          events: {},
          name: entry.data?.lifecycleName || '',
        };
        cycles.push(currentCycle);
      }

      currentCycle.events[stage] = entry;
      if (!currentCycle.name) {
        currentCycle.name = entry.data?.lifecycleName || '';
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

  get selectedCycleTimeline(): GrowCycleTimeline | undefined {
    return this.cycleTimelines.length > 0 ? this.cycleTimelines[Math.min(this.selectedCycleIndex, this.cycleTimelines.length - 1)] : undefined;
  }

  get totalEventsInSelectedCycle(): number {
    const timeline = this.selectedCycleTimeline;
    if (!timeline) {
      return 0;
    }

    return timeline.phaseTimeline.reduce((sum, phase) => sum + phase.eventsByDay.reduce((count, day) => count + day.events.length, 0), 0);
  }

  private calculateDayCount(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  private formatGapLabel(days: number): string {
    if (days <= 0) {
      return '';
    }

    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    const parts: string[] = [];

    if (weeks > 0) {
      parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
    }

    if (remainingDays > 0) {
      parts.push(`${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}`);
    }

    return parts.join(' ') + ' later';
  }

  private isLifecycleLog(log: DeviceLog): boolean {
    return Array.isArray(log.categories) && log.categories.includes('plant-lifecycle');
  }

  onCycleSelected(event: any) {
    this.selectedCycleIndex = event.detail.value;
  }

}
