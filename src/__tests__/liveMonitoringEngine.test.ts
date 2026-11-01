import { describe, expect, it } from 'vitest';
import {
  Employee,
  EmployeeSummary,
  RepBatchId,
  RepLiveTelemetry,
} from '../types';
import {
  ActiveEpisodeTrackerEntry,
  GPS_STALE_THRESHOLD_MS,
  buildMonitoredRepresentatives,
  evaluateRepresentativeAlerts,
  filterMonitoredRepresentatives,
  reconcileAlertEpisodes,
  sortMonitoredRepresentatives,
} from '../utils/liveMonitoringEngine';

function makeEmployee(id: string, name: string, code = id): Employee {
  return {
    id,
    employeeCode: code,
    fullName: name,
    phone: '01012345678',
    hireDate: '2025-01-01',
    status: 'active',
    externalId: `EXT_${id}`,
    teamId: 'team_cairo',
    userId: '',
    notes: '',
  };
}

function makeSummary(overrides: Partial<EmployeeSummary> = {}): EmployeeSummary {
  return {
    workedDays: 10,
    absentDays: 0,
    leaveDays: 0,
    dayOffDays: 0,
    selectedDays: 10,
    selectedNotWorkedDays: 0,
    totalHours: 80,
    avgHours: 8,
    commitmentRate: 100,
    performanceRate: 95,
    remainingDays: 20,
    ...overrides,
  };
}

function makeTelemetry(
  employeeId: string,
  batch: RepBatchId,
  walletBalance: number,
  overrides: Partial<RepLiveTelemetry> = {}
): RepLiveTelemetry {
  return {
    employeeId,
    teamId: 'team_cairo',
    userId: '',
    batch,
    walletBalance,
    hasGpsFix: true,
    lat: 30.0444,
    lng: 31.2357,
    accuracy: 12,
    isOnline: true,
    gpsUpdatedAtMs: 1_700_000_000_000,
    updatedBy: 'ops_1',
    ...overrides,
  };
}

describe('Live Representatives Monitoring & Smart Alerts Engine', () => {
  it('binds Red Alert strictly to existing system performance rule (absentDays > 0 or selectedNotWorkedDays > 0)', () => {
    const emp = makeEmployee('EMP001', 'أحمد السيد');
    const cleanEval = evaluateRepresentativeAlerts({
      employee: emp,
      summary: makeSummary({ absentDays: 0, selectedNotWorkedDays: 0 }),
      telemetry: makeTelemetry('EMP001', 'Batch 1', 1200),
    });
    expect(cleanEval.primarySeverity).toBe('none');
    expect(cleanEval.alerts).toHaveLength(0);

    const redEval = evaluateRepresentativeAlerts({
      employee: emp,
      summary: makeSummary({ absentDays: 1, selectedNotWorkedDays: 2 }),
      telemetry: makeTelemetry('EMP001', 'Batch 1', 1200),
    });
    expect(redEval.primarySeverity).toBe('red');
    expect(redEval.alerts).toHaveLength(1);
    expect(redEval.alerts[0].alertType).toBe('performance_red');
    expect(redEval.alerts[0].reason).toContain('مسجل غياب (1 يوم)');
    expect(redEval.alerts[0].reason).toContain('اختار شفت ولم يعمل (2 يوم)');
  });

  it('triggers Orange Wallet Alert for Batch 4, 5, 6 strictly when wallet > 2000 EGP', () => {
    const emp = makeEmployee('EMP004', 'محمود علي');

    for (const batch of ['Batch 4', 'Batch 5', 'Batch 6'] as RepBatchId[]) {
      const exactBoundary = evaluateRepresentativeAlerts({
        employee: emp,
        summary: makeSummary(),
        telemetry: makeTelemetry('EMP004', batch, 2000),
      });
      expect(exactBoundary.alerts).toHaveLength(0);

      const exceeded = evaluateRepresentativeAlerts({
        employee: emp,
        summary: makeSummary(),
        telemetry: makeTelemetry('EMP004', batch, 2000.01),
      });
      expect(exceeded.primarySeverity).toBe('orange');
      expect(exceeded.alerts).toHaveLength(1);
      expect(exceeded.alerts[0].reason).toBe('المحفظة تجاوزت 2000 جنيه');
    }
  });

  it('triggers Orange Wallet Alert for Batch 1, 2, 3 strictly when wallet > 2500 EGP', () => {
    const emp = makeEmployee('EMP002', 'عمر خالد');

    for (const batch of ['Batch 1', 'Batch 2', 'Batch 3'] as RepBatchId[]) {
      const underBoundary = evaluateRepresentativeAlerts({
        employee: emp,
        summary: makeSummary(),
        telemetry: makeTelemetry('EMP002', batch, 2500),
      });
      expect(underBoundary.alerts).toHaveLength(0);

      const exceeded = evaluateRepresentativeAlerts({
        employee: emp,
        summary: makeSummary(),
        telemetry: makeTelemetry('EMP002', batch, 2501),
      });
      expect(exceeded.primarySeverity).toBe('orange');
      expect(exceeded.alerts).toHaveLength(1);
      expect(exceeded.alerts[0].reason).toBe('المحفظة تجاوزت 2500 جنيه');
    }
  });

  it('preserves BOTH Red and Orange alerts simultaneously while prioritizing Red on map and sorting', () => {
    const emp = makeEmployee('EMP010', 'كريم طارق');
    const result = evaluateRepresentativeAlerts({
      employee: emp,
      summary: makeSummary({ absentDays: 1, performanceRate: 70 }),
      telemetry: makeTelemetry('EMP010', 'Batch 5', 2450),
    });

    expect(result.primarySeverity).toBe('red');
    expect(result.alerts).toHaveLength(2);
    expect(result.alerts.map((a) => a.severity)).toEqual(['red', 'orange']);
  });

  it('sorts representatives strictly: 1. Red -> 2. Orange -> 3. Highest System Performance', () => {
    const nowMs = 1_700_000_010_000;
    const employees = [
      makeEmployee('EMP1', 'مندوب أداء متوسط بدون تنبيه'),
      makeEmployee('EMP2', 'مندوب تنبيه برتقالي'),
      makeEmployee('EMP3', 'مندوب أداء ممتاز بدون تنبيه'),
      makeEmployee('EMP4', 'مندوب تنبيه أحمر + برتقالي'),
    ];
    const summaries: Record<string, EmployeeSummary> = {
      EMP1: makeSummary({ performanceRate: 82, totalHours: 64 }),
      EMP2: makeSummary({ performanceRate: 99, totalHours: 95 }),
      EMP3: makeSummary({ performanceRate: 97, totalHours: 90 }),
      EMP4: makeSummary({ absentDays: 1, performanceRate: 60 }),
    };
    const telemetryMap: Record<string, RepLiveTelemetry> = {
      EMP1: makeTelemetry('EMP1', 'Batch 1', 500, { gpsUpdatedAtMs: nowMs }),
      EMP2: makeTelemetry('EMP2', 'Batch 4', 2300, { gpsUpdatedAtMs: nowMs }),
      EMP3: makeTelemetry('EMP3', 'Batch 2', 1100, { gpsUpdatedAtMs: nowMs }),
      EMP4: makeTelemetry('EMP4', 'Batch 6', 2800, { gpsUpdatedAtMs: nowMs }),
    };

    const monitored = buildMonitoredRepresentatives({
      employees,
      summaries,
      attendanceRecords: {},
      telemetryMap,
      todayStr: '2025-05-10',
      nowMs,
    });
    const sorted = sortMonitoredRepresentatives(monitored);

    expect(sorted.map((x) => x.employee.id)).toEqual([
      'EMP4', // Red first
      'EMP2', // Orange second
      'EMP3', // Normal highest performance (97%)
      'EMP1', // Normal lower performance (82%)
    ]);

    // Filtering by 'orange' still surfaces EMP4 (who carries both red + orange) and EMP2
    const orangeFiltered = filterMonitoredRepresentatives(sorted, {
      alertFilter: 'orange',
      batchFilter: 'all',
      searchQuery: '',
    });
    expect(orangeFiltered.map((x) => x.employee.id)).toEqual(['EMP4', 'EMP2']);
  });

  it('fires each alert episode ONCE and auto-resolves immediately when condition clears', () => {
    const nowMs = 1_700_000_000_000;
    const emp = makeEmployee('EMP050', 'ياسر منصور');

    // Step 1: Wallet exceeds 2500 on Batch 2 -> triggers ONCE
    const listStep1 = buildMonitoredRepresentatives({
      employees: [emp],
      summaries: { EMP050: makeSummary() },
      attendanceRecords: {},
      telemetryMap: {
        EMP050: makeTelemetry('EMP050', 'Batch 2', 2750, { gpsUpdatedAtMs: nowMs }),
      },
      todayStr: '2025-05-10',
      nowMs,
    });

    const r1 = reconcileAlertEpisodes({
      previousEpisodes: new Map<string, ActiveEpisodeTrackerEntry>(),
      monitoredList: listStep1,
      nowMs,
    });
    expect(r1.newlyTriggered).toHaveLength(1);
    expect(r1.resolvedEpisodes).toHaveLength(0);

    // Step 2: GPS updates 10 seconds later while wallet is still 2750 -> MUST NOT re-trigger sound/episode
    const listStep2 = buildMonitoredRepresentatives({
      employees: [emp],
      summaries: { EMP050: makeSummary() },
      attendanceRecords: {},
      telemetryMap: {
        EMP050: makeTelemetry('EMP050', 'Batch 2', 2750, {
          lat: 30.05,
          gpsUpdatedAtMs: nowMs + 10_000,
        }),
      },
      todayStr: '2025-05-10',
      nowMs: nowMs + 10_000,
    });
    const r2 = reconcileAlertEpisodes({
      previousEpisodes: r1.nextEpisodes,
      monitoredList: listStep2,
      nowMs: nowMs + 10_000,
    });
    expect(r2.newlyTriggered).toHaveLength(0);
    expect(r2.resolvedEpisodes).toHaveLength(0);

    // Step 3: Rep settles wallet down to 400 EGP -> auto-resolves episode
    const listStep3 = buildMonitoredRepresentatives({
      employees: [emp],
      summaries: { EMP050: makeSummary() },
      attendanceRecords: {},
      telemetryMap: {
        EMP050: makeTelemetry('EMP050', 'Batch 2', 400, {
          gpsUpdatedAtMs: nowMs + 20_000,
        }),
      },
      todayStr: '2025-05-10',
      nowMs: nowMs + 20_000,
    });
    const r3 = reconcileAlertEpisodes({
      previousEpisodes: r2.nextEpisodes,
      monitoredList: listStep3,
      nowMs: nowMs + 20_000,
    });
    expect(r3.newlyTriggered).toHaveLength(0);
    expect(r3.resolvedEpisodes).toHaveLength(1);
    expect(r3.nextEpisodes.size).toBe(0);
  });

  it('marks GPS signal as stale/offline when timestamp exceeds threshold and scales smoothly to 1000 reps', () => {
    const baseNow = 1_700_001_000_000;
    const staleNow = baseNow + GPS_STALE_THRESHOLD_MS + 5_000;

    const employees: Employee[] = [];
    const summaries: Record<string, EmployeeSummary> = {};
    const telemetryMap: Record<string, RepLiveTelemetry> = {};

    for (let i = 1; i <= 1000; i++) {
      const id = `EMP${i}`;
      employees.push(makeEmployee(id, `مندوب ${i}`));
      summaries[id] = makeSummary({ performanceRate: i % 100 });
      telemetryMap[id] = makeTelemetry(
        id,
        `Batch ${((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6}`,
        i * 4,
        { gpsUpdatedAtMs: i === 1 ? baseNow : staleNow }
      );
    }

    const start = performance.now();
    const monitored = buildMonitoredRepresentatives({
      employees,
      summaries,
      attendanceRecords: {},
      telemetryMap,
      todayStr: '2025-05-10',
      nowMs: staleNow,
    });
    const sorted = sortMonitoredRepresentatives(monitored);
    const elapsedMs = performance.now() - start;

    const firstEmp = monitored.find((m) => m.employee.id === 'EMP1')!;
    expect(firstEmp.connectionState).toBe('stale');
    expect(sorted).toHaveLength(1000);
    expect(elapsedMs).toBeLessThan(250);
  });
});
