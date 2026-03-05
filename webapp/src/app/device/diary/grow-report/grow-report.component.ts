import {Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from '@angular/core';
import {DeviceLog, DeviceService} from "../../../services/devices.service";
import {Subscription} from "rxjs";
import {DiaryEntryData, defaultDiaryEntries} from "../diary-entry-modal/diary-entry-modal.component";
import {collectLogCategories, filterLogsByCategory, LogEntryViewerLog} from "../../log-entry-viewer/log-entry-viewer.component";
import {Router} from "@angular/router";

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
  dayNumberInPhase: number;
  events: TimelineEvent[];
  gapToNextDays?: number;
  gapLabel?: string;
};

type TimelinePhaseGroup = {
  stage: DiaryEntryData['newLifecycleStage'];
  eventsByDay: TimelineDayGroup[];
};

type PhaseSummary = {
  stage: DiaryEntryData['newLifecycleStage'];
  startDate: Date;
  durationDays: number;
  totalDaysFromStart: number;
};

type GrowCycleTimeline = GrowCycle & {
  phaseTimeline: TimelinePhaseGroup[];
  phaseSummaries: PhaseSummary[];
  lastEventDate?: Date;
};

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

  constructor(private devices: DeviceService, private router: Router) {
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

    // Pre-calculate gaps between consecutive days across all logs
    const dayGaps = this.calculateDayGaps(merged);

    this.cycleTimelines = this.growCycles.map((cycle, index) => this.buildTimelineForCycle(cycle, merged, index, dayGaps));
    console.log(this.cycleTimelines);
  }

  private calculateDayGaps(logs: LogEntryViewerLog[]): Map<string, { gapToNextDays: number; gapLabel: string }> {
    const dayGaps = new Map<string, { gapToNextDays: number; gapLabel: string }>();

    // Get unique days sorted chronologically
    const uniqueDays: Date[] = [];
    const seenDays = new Set<string>();

    for (const log of logs) {
      const dayDate = this.toStartOfDay(new Date(log.time));
      const dayKey = this.toDayKey(dayDate);
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey);
        uniqueDays.push(dayDate);
      }
    }

    uniqueDays.sort((a, b) => a.getTime() - b.getTime());

    // Calculate gaps between consecutive days
    for (let i = 0; i < uniqueDays.length; i++) {
      const currentDay = uniqueDays[i];
      const nextDay = i < uniqueDays.length - 1 ? uniqueDays[i + 1] : new Date(); // Compare last day to today
      const gapDays = this.calculateDayCount(currentDay, nextDay);
      if (gapDays > 0) {
        const dayKey = this.toDayKey(currentDay);
        dayGaps.set(dayKey, {
          gapToNextDays: gapDays,
          gapLabel: this.formatGapLabel(gapDays),
        });
      }
    }

    return dayGaps;
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

  private buildTimelineForCycle(
    cycle: GrowCycle,
    logs: LogEntryViewerLog[],
    cycleIndex: number,
    dayGaps: Map<string, { gapToNextDays: number; gapLabel: string }>
  ): GrowCycleTimeline {
    const cycleStart = new Date(cycle.timestampStart);
    const nextCycleStart = this.growCycles[cycleIndex + 1]?.timestampStart;
    const cycleEnd = nextCycleStart
      ? new Date(nextCycleStart)
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
        const gap = dayGaps.get(dayKey);
        dayGroup = {
          dayKey,
          date: dayDate,
          dayNumberInCycle: this.calculateDayCount(this.toStartOfDay(cycleStart), dayDate) + 1,
          dayNumberInPhase: 0, // Will be calculated after sorting
          events: [],
          gapToNextDays: gap?.gapToNextDays,
          gapLabel: gap?.gapLabel,
        };
        phaseGroup.eventsByDay.push(dayGroup);
      }

      dayGroup.events.push(event);
    }

    // Sort days within each phase and calculate dayNumberInPhase
    for (const phase of phaseTimeline) {
      phase.eventsByDay.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Calculate day number in phase based on actual day difference from first day
      if (phase.eventsByDay.length > 0) {
        const firstDayInPhase = phase.eventsByDay[0].date;
        for (const day of phase.eventsByDay) {
          day.dayNumberInPhase = this.calculateDayCount(firstDayInPhase, day.date) + 1;
        }
      }
    }

    return {
      ...cycle,
      phaseTimeline,
      phaseSummaries: this.buildPhaseSummaries(phaseTimeline, cycleStart),
      lastEventDate: eventsInCycle.length > 0 ? eventsInCycle[eventsInCycle.length - 1].time : undefined,
    };
  }

  private buildPhaseSummaries(phaseTimeline: TimelinePhaseGroup[], cycleStart: Date): PhaseSummary[] {
    const summaries: PhaseSummary[] = [];

    for (let i = 0; i < phaseTimeline.length; i++) {
      const phase = phaseTimeline[i];
      const nextPhase = phaseTimeline[i + 1];

      const firstDay = phase.eventsByDay[0];
      if (!firstDay) {
        continue;
      }

      const startDate = firstDay.date;
      let endDate: Date;

      if (nextPhase && nextPhase.eventsByDay[0]) {
        endDate = nextPhase.eventsByDay[0].date;
      } else {
        const lastDay = phase.eventsByDay[phase.eventsByDay.length - 1];
        endDate = lastDay ? lastDay.date : startDate;
      }

      const durationDays = this.calculateDayCount(startDate, endDate);
      const totalDaysFromStart = this.calculateDayCount(this.toStartOfDay(cycleStart), startDate) + 1;

      summaries.push({
        stage: phase.stage,
        startDate,
        durationDays: Math.max(1, durationDays),
        totalDaysFromStart,
      });
    }

    return summaries;
  }

  private formatGapLabelUntilToday(days: number): string {
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

    return parts.join(' ') + ' until today';
  }

  scrollToPhase(stage: DiaryEntryData['newLifecycleStage']): void {
    const element = document.getElementById('phase-' + stage);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  navigateToCharts(summary: PhaseSummary): void {
    const timeline = this.selectedCycleTimeline;
    if (!timeline || !this.deviceId) {
      return;
    }

    const phase = timeline.phaseTimeline.find(p => p.stage === summary.stage);
    if (!phase || !phase.eventsByDay.length) {
      return;
    }

    const startDate = summary.startDate;

    // Find the end date: either next phase start or last event in this phase + 1 day
    const currentIndex = timeline.phaseTimeline.indexOf(phase);
    const nextPhase = timeline.phaseTimeline[currentIndex + 1];

    let endDate: Date;
    if (nextPhase && nextPhase.eventsByDay[0]) {
      endDate = nextPhase.eventsByDay[0].date;
    } else {
      const lastDay = phase.eventsByDay[phase.eventsByDay.length - 1];
      endDate = new Date(lastDay.date);
      endDate.setDate(endDate.getDate() + 1);
    }

    this.navigateToChartsWithDateRange(startDate, endDate);
  }

  navigateToChartsForCycle(): void {
    const timeline = this.selectedCycleTimeline;
    if (!timeline || !this.deviceId) {
      return;
    }

    const startDate = timeline.timestampStart;

    // End date is either the cycle end date, last event date + 1 day, or now
    let endDate: Date;
    if (timeline.timestampEnd) {
      endDate = new Date(timeline.timestampEnd);
    } else if (timeline.lastEventDate) {
      endDate = new Date(timeline.lastEventDate);
      endDate.setDate(endDate.getDate() + 1);
    } else {
      endDate = new Date();
    }

    this.navigateToChartsWithDateRange(startDate, endDate);
  }

  private navigateToChartsWithDateRange(startDate: Date, endDate: Date): void {
    const queryParams = {
      date: startDate.toISOString(),
      dateEnd: endDate.toISOString(),
      measures: 'temperature,image,logs',
      useCustom: 'true',
      vpdMode: 'day',
      interval: '1h',
      logs: this.selectedLogCategories?.join(',') || '',
    };

    void this.router.navigate(['device', this.deviceId, 'charts'], { queryParams });
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
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

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
