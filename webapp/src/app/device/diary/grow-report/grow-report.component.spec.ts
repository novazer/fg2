import { GrowReportComponent } from './grow-report.component';
import type { DeviceLog, DiaryEntryData } from '@fg2/shared-types';

describe('GrowReportComponent convertEventsToGrowCycles', () => {
  let component: GrowReportComponent;

  beforeEach(() => {
    component = new GrowReportComponent({} as any, { navigate: jasmine.createSpy('navigate') } as any);
  });

  function lifecycleLog(
    id: string,
    time: string,
    stage: DiaryEntryData['newLifecycleStage'],
    lifecycleName = ''
  ): DeviceLog {
    return {
      _id: id,
      device_id: 'dev-1',
      severity: 1,
      time: new Date(time),
      categories: ['diary-plant-lifecycle'],
      data: {
        newLifecycleStage: stage,
        lifecycleName,
      },
    };
  }

  it('detects multiple cycles even when stages are skipped and final cycle is incomplete', () => {
    const events: DeviceLog[] = [
      lifecycleLog('1', '2026-01-01T10:00:00Z', 'germination'),
      lifecycleLog('2', '2026-01-03T10:00:00Z', 'vegetative'), // seedling skipped
      lifecycleLog('3', '2026-01-10T10:00:00Z', 'flowering'),
      lifecycleLog('4', '2026-02-01T10:00:00Z', 'seedling'), // rollback => new cycle
      lifecycleLog('5', '2026-02-08T10:00:00Z', 'drying'), // skipped stages allowed
      lifecycleLog('6', '2026-03-01T10:00:00Z', 'seedling'), // rollback => third cycle
    ];

    const cycles = (component as any).convertEventsToGrowCycles(events);

    expect(cycles.length).toBe(3);
    expect(cycles[0].timestampStart.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(cycles[1].timestampStart.toISOString()).toBe('2026-02-01T10:00:00.000Z');
    expect(cycles[2].timestampStart.toISOString()).toBe('2026-03-01T10:00:00.000Z');

    expect(cycles[0].timestampEnd?.toISOString()).toBe('2026-02-01T10:00:00.000Z');
    expect(cycles[1].timestampEnd?.toISOString()).toBe('2026-03-01T10:00:00.000Z');
    expect(cycles[2].timestampEnd).toBeUndefined();
  });

  it('does not split a cycle for duplicate updates of the same stage', () => {
    const events: DeviceLog[] = [
      lifecycleLog('1', '2026-01-01T10:00:00Z', 'germination'),
      lifecycleLog('2', '2026-01-02T10:00:00Z', 'germination'),
      lifecycleLog('3', '2026-01-03T10:00:00Z', 'seedling'),
    ];

    const cycles = (component as any).convertEventsToGrowCycles(events);

    expect(cycles.length).toBe(1);
    expect(cycles[0].events.germination?._id).toBe('2'); // latest event wins for a stage
  });

  it('starts a new cycle when lifecycle name changes even without order rollback', () => {
    const events: DeviceLog[] = [
      lifecycleLog('1', '2026-01-01T10:00:00Z', 'vegetative', 'Cycle A'),
      lifecycleLog('2', '2026-01-02T10:00:00Z', 'flowering', 'Cycle A'),
      lifecycleLog('3', '2026-01-03T10:00:00Z', 'flowering', 'Cycle B'),
      lifecycleLog('4', '2026-01-04T10:00:00Z', 'drying', 'Cycle B'),
    ];

    const cycles = (component as any).convertEventsToGrowCycles(events);

    expect(cycles.length).toBe(2);
    expect(cycles[0].name).toBe('Cycle A');
    expect(cycles[1].name).toBe('Cycle B');
    expect(cycles[0].timestampEnd?.toISOString()).toBe('2026-01-03T10:00:00.000Z');
  });

  it('uses diary lifecycle events for durationDays across cycles and keeps curing open until today', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-03-22T12:00:00Z'));

    try {
      const lifecycleLogs: DeviceLog[] = [
        lifecycleLog('1', '2026-03-01T10:00:00Z', 'flowering'),
        lifecycleLog('2', '2026-03-10T09:00:00Z', 'drying'),
        lifecycleLog('3', '2026-03-15T08:00:00Z', 'seedling'),
      ];

      (component as any).lifecycleLogs = lifecycleLogs;

      const phaseTimeline = [
        {
          stage: 'flowering',
          eventsByDay: [{
            dayKey: '2026-03-01T00:00:00.000Z',
            date: new Date('2026-03-01T00:00:00Z'),
            dayNumberInCycle: 1,
            dayNumberInPhase: 1,
            gapToNextDays: 0,
            gapLabel: '',
            events: [{
              log: lifecycleLogs[0],
              time: new Date('2026-03-01T10:00:00Z'),
              stage: 'flowering',
              isLifecycle: true,
            }],
          }],
        },
        {
          stage: 'curing',
          eventsByDay: [{
            dayKey: '2026-03-20T00:00:00.000Z',
            date: new Date('2026-03-20T00:00:00Z'),
            dayNumberInCycle: 20,
            dayNumberInPhase: 1,
            gapToNextDays: 0,
            gapLabel: '',
            events: [{
              log: lifecycleLogs[1],
              time: new Date('2026-03-20T11:00:00Z'),
              stage: 'curing',
              isLifecycle: true,
            }],
          }],
        },
      ] as any;

      const summaries = (component as any).buildPhaseSummaries(phaseTimeline, new Date('2026-03-01T00:00:00Z'));
      const flowering = summaries.find((s: any) => s.stage === 'flowering');
      const curing = summaries.find((s: any) => s.stage === 'curing');

      expect(flowering?.durationDays).toBe(9); // 2026-03-01 -> next lifecycle (2026-03-10)
      expect(curing?.durationDays).toBe(2); // curing always ends at mocked today (2026-03-22)
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('treats both legacy and new lifecycle categories as lifecycle logs', () => {
    const legacyLog = lifecycleLog('legacy', '2026-03-01T10:00:00Z', 'seedling');
    legacyLog.categories = ['plant-lifecycle'];

    const newLog = lifecycleLog('new', '2026-03-02T10:00:00Z', 'seedling');
    newLog.categories = ['diary-plant-lifecycle'];

    expect((component as any).isLifecycleLog(legacyLog)).toBeTrue();
    expect((component as any).isLifecycleLog(newLog)).toBeTrue();
  });
});

