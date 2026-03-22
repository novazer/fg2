import {Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from '@angular/core';
import {DeviceService} from "../../../services/devices.service";
import {Subscription} from "rxjs";
import {defaultDiaryEntries} from "../diary-entry-modal/diary-entry-modal.component";
import {collectLogCategories, filterLogsByCategory, LogEntryViewerLog} from "../../log-entry-viewer/log-entry-viewer.component";
import {Router} from "@angular/router";
import type { DiaryEntryData, DeviceLog } from '@fg2/shared-types';

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
  public availableLogCategories: string[] = [];
  public selectedLogCategories: string[] = ['device-configuration', 'recipe', 'diary'];

  private allLogs: LogEntryViewerLog[] = [];
  private lifecycleLogs: LogEntryViewerLog[] = [];
  private static readonly LIFECYCLE_CATEGORIES = ['diary-plant-lifecycle', 'plant-lifecycle'] as const;

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
      this.selectedCycleIndex = 0;
      return;
    }

    this.loading = true;
    try {
      const lifecycleLogs = await this.devices.getLogs(
        this.deviceId,
        undefined,
        undefined,
        true,
        [...GrowReportComponent.LIFECYCLE_CATEGORIES]
      );

      this.lifecycleLogs = lifecycleLogs.filter(log => !!log.data?.newLifecycleStage);
      this.growCycles = this.convertEventsToGrowCycles(this.lifecycleLogs);

      if (!this.lifecycleLogs.length) {
        this.allLogs = [];
        this.cycleTimelines = [];
        this.availableLogCategories = [];
        this.selectedLogCategories = [];
        this.selectedCycleIndex = 0;
        return;
      }

      const timeframe = this.getLifecycleTimeframe();
      const logs = await this.devices.getLogs(
        this.deviceId,
        timeframe.timestampFrom,
        timeframe.timestampTo,
        true
      );

      this.allLogs = logs;
      this.availableLogCategories = collectLogCategories(logs);
      this.selectedCycleIndex = 0;
      this.ensureSelectedCategories();
      this.rebuildTimelines();
    } finally {
      this.loading = false;
    }
  }

  private getLifecycleTimeframe(): { timestampFrom: number; timestampTo: number } {
    const start = new Date(this.growCycles[0]?.timestampStart ?? this.lifecycleLogs[0]?.time ?? new Date());
    const end = this.growCycles[this.growCycles.length - 1]?.timestampEnd
      ? new Date(this.growCycles[this.growCycles.length - 1].timestampEnd as Date)
      : new Date();

    return {
      timestampFrom: start.getTime(),
      timestampTo: end.getTime(),
    };
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

    this.cycleTimelines = this.growCycles.map((cycle) => this.buildTimelineForCycle(cycle, merged, dayGaps));
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
    dayGaps: Map<string, { gapToNextDays: number; gapLabel: string }>
  ): GrowCycleTimeline {
    const cycleStart = new Date(cycle.timestampStart);
    const nextCycleStart = this.findNextCycleStart(cycleStart);
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

  private findNextCycleStart(cycleStart: Date): Date | undefined {
    const currentStartTime = cycleStart.getTime();
    let nextStart: Date | undefined;

    for (const cycle of this.growCycles) {
      const start = new Date(cycle.timestampStart);
      if (start.getTime() <= currentStartTime) {
        continue;
      }

      if (!nextStart || start.getTime() < nextStart.getTime()) {
        nextStart = start;
      }
    }

    return nextStart;
  }

  private buildPhaseSummaries(phaseTimeline: TimelinePhaseGroup[], cycleStart: Date): PhaseSummary[] {
    const summaries: PhaseSummary[] = [];
    const today = this.toStartOfDay(new Date());

    for (let i = 0; i < phaseTimeline.length; i++) {
      const phase = phaseTimeline[i];

      const firstDay = phase.eventsByDay[0];
      if (!firstDay) {
        continue;
      }

      const startDate = firstDay.date;
      const phaseStartAnchor = this.getPhaseStartAnchor(phase, startDate);
      const nextLifecycleEventDate = this.findNextLifecycleEventDate(phaseStartAnchor);
      const endDate = phase.stage === 'curing'
        ? today
        : (nextLifecycleEventDate ? this.toStartOfDay(nextLifecycleEventDate) : today);

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

  private getPhaseStartAnchor(phase: TimelinePhaseGroup, fallbackStartDate: Date): Date {
    for (const day of phase.eventsByDay) {
      const lifecycleEvent = day.events.find(event => event.isLifecycle && event.stage === phase.stage);
      if (lifecycleEvent) {
        return lifecycleEvent.time;
      }
    }

    const firstEvent = phase.eventsByDay[0]?.events[0];
    return firstEvent ? firstEvent.time : fallbackStartDate;
  }

  private findNextLifecycleEventDate(currentStageStart: Date): Date | undefined {
    const currentStartTime = new Date(currentStageStart).getTime();
    let nextEvent: Date | undefined;

    for (const log of this.lifecycleLogs) {
      const logTime = new Date(log.time);
      const timestamp = logTime.getTime();
      if (timestamp <= currentStartTime) {
        continue;
      }

      if (!nextEvent || timestamp < nextEvent.getTime()) {
        nextEvent = logTime;
      }
    }

    return nextEvent;
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

    let previousLifecycleOrder: number | undefined = undefined;
    let currentCycle: GrowCycle | null = null;

    for (const entry of sortedEntries) {
      const stage = entry.data?.newLifecycleStage;
      if (!stage) {
        continue;
      }

      const lifecycleOrder = (LIFECYCLE_EVENT_ORDER as Record<string, number | undefined>)[stage];
      if (lifecycleOrder === undefined) {
        continue;
      }

      const currentLifecycleName = currentCycle?.name?.trim() || '';
      const entryLifecycleName = entry.data?.lifecycleName?.trim() || '';
      const hasNameBoundary = !!currentCycle
        && !!currentLifecycleName
        && !!entryLifecycleName
        && entryLifecycleName !== currentLifecycleName;
      const hasOrderRollback = previousLifecycleOrder !== undefined && lifecycleOrder < previousLifecycleOrder;
      const startNewCycle = !!currentCycle && (hasNameBoundary || hasOrderRollback);

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

    return cycles.reverse();
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
    return Array.isArray(log.categories)
      && GrowReportComponent.LIFECYCLE_CATEGORIES.some(category => log.categories?.includes(category));
  }

  onCycleSelected(event: any) {
    this.selectedCycleIndex = event.detail.value;
  }

}
