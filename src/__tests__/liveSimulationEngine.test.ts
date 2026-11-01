import { describe, expect, it } from 'vitest';
import {
  advanceSimulationGpsStep,
  applySimulationScenario,
  createInactiveSimulationState,
} from '../utils/liveSimulationEngine';
import {
  buildMonitoredRepresentatives,
  reconcileAlertEpisodes,
  sortMonitoredRepresentatives,
} from '../utils/liveMonitoringEngine';
import { Employee, EmployeeSummary } from '../types';

describe('liveSimulationEngine — محاكاة اختبار الخريطة الحية والتنبيهات الذكية', () => {
  const todayStr = '2026-04-12';
  const baseNowMs = 1_760_000_000_000;

  it('ينشئ أسطول محاكاة مؤقتاً في الذاكرة (SIM001..SIM008) عند عدم وجود مناديب في قاعدة البيانات', () => {
    const state = applySimulationScenario({
      realEmployees: [],
      realSummaries: {},
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: createInactiveSimulationState(),
      scenario: 'balanced_fleet',
      todayStr,
      nowMs: baseNowMs,
    });

    expect(state.isActive).toBe(true);
    expect(state.usesSyntheticFleet).toBe(true);
    expect(state.employees.length).toBe(8);
    expect(state.employees[0].employeeCode).toBe('SIM001');

    const monitored = buildMonitoredRepresentatives({
      employees: state.employees,
      summaries: state.summaries,
      attendanceRecords: state.attendanceRecords,
      telemetryMap: state.telemetryMap,
      todayStr,
      nowMs: baseNowMs,
    });

    expect(monitored.length).toBe(8);
    expect(monitored.every((m) => m.telemetry.hasGpsFix)).toBe(true);
    expect(monitored.every((m) => m.alerts.length === 0)).toBe(true);
  });

  it('يستخدم المناديب الفعليين دون المساس بالكائنات الأصلية ويختبر كل سيناريوهات التنبيهات بدقة', () => {
    const realEmployees: Employee[] = [1, 2, 3, 4, 5].map((n) => ({
      id: `EMP00${n}`,
      employeeCode: `EMP00${n}`,
      fullName: `مندوب فعلي ${n}`,
      phone: `0101234567${n}`,
      hireDate: '2025-01-01',
      status: 'active',
      externalId: `EXT_${n}`,
      notes: '',
    }));

    const realSummaries: Record<string, EmployeeSummary> = {};
    realEmployees.forEach((emp, idx) => {
      realSummaries[emp.id] = {
        workedDays: 15,
        absentDays: 0,
        leaveDays: 0,
        dayOffDays: 2,
        selectedDays: 15,
        selectedNotWorkedDays: 0,
        totalHours: 120,
        avgHours: 8,
        commitmentRate: 90 + idx,
        performanceRate: 90 + idx,
        remainingDays: 2,
      };
    });

    // 1. تفعيل تنبيه أحمر (أولوية 1)
    let sim = applySimulationScenario({
      realEmployees,
      realSummaries,
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: createInactiveSimulationState(),
      scenario: 'trigger_red_alert',
      todayStr,
      nowMs: baseNowMs,
    });

    expect(sim.usesSyntheticFleet).toBe(false);
    // التحقق من عدم تعديل الملخص الأصلي خارج المحاكاة
    expect(realSummaries.EMP001.absentDays).toBe(0);

    // 2. تفعيل برتقالي Batch 4/5/6 (> 2000 جنيه)
    sim = applySimulationScenario({
      realEmployees,
      realSummaries,
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: sim,
      scenario: 'trigger_orange_456',
      todayStr,
      nowMs: baseNowMs + 1000,
    });

    // 3. تفعيل برتقالي Batch 1/2/3 (> 2500 جنيه)
    sim = applySimulationScenario({
      realEmployees,
      realSummaries,
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: sim,
      scenario: 'trigger_orange_123',
      todayStr,
      nowMs: baseNowMs + 2000,
    });

    // 4. تفعيل اجتماع الأحمر والبرتقالي معاً على مندوب واحد
    sim = applySimulationScenario({
      realEmployees,
      realSummaries,
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: sim,
      scenario: 'trigger_combined_red_orange',
      todayStr,
      nowMs: baseNowMs + 3000,
    });

    // 5. تفعيل انقطاع GPS على مندوب آخر
    sim = applySimulationScenario({
      realEmployees,
      realSummaries,
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: sim,
      scenario: 'trigger_gps_disconnect',
      todayStr,
      nowMs: baseNowMs + 4000,
    });

    const monitored = sortMonitoredRepresentatives(
      buildMonitoredRepresentatives({
        employees: sim.employees,
        summaries: sim.summaries,
        attendanceRecords: sim.attendanceRecords,
        telemetryMap: sim.telemetryMap,
        todayStr,
        nowMs: baseNowMs + 4000,
      })
    );

    // أعلى القائمة يجب أن يكون التنبيه الأحمر أولاً
    expect(monitored[0].primarySeverity).toBe('red');

    // المندوب ذو التنبيه المزدوج يحمل اللون الأحمر مع وجود التنبيهين معاً
    const dualRep = monitored.find((m) => m.employee.id === 'EMP004')!;
    expect(dualRep.primarySeverity).toBe('red');
    expect(dualRep.markerTone).toBe('red');
    expect(dualRep.alerts.length).toBe(2);

    // المندوب ذو انقطاع GPS يظهر بحالة stale (Offline · آخر موقع معروف)
    const disconnectedRep = monitored.find((m) => m.employee.id === 'EMP005')!;
    expect(disconnectedRep.connectionState).toBe('stale');
    expect(disconnectedRep.statusLabelAr).toContain('آخر موقع معروف');

    // اختبار إطلاق حلقات التنبيه ثم إغلاقها التلقائي عند تشغيل resolve_all_alerts
    const firstPass = reconcileAlertEpisodes({
      previousEpisodes: new Map(),
      monitoredList: monitored,
      nowMs: baseNowMs + 4000,
    });
    expect(firstPass.newlyTriggered.length).toBeGreaterThanOrEqual(4);

    const resolvedSim = applySimulationScenario({
      realEmployees,
      realSummaries,
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: sim,
      scenario: 'resolve_all_alerts',
      todayStr,
      nowMs: baseNowMs + 8000,
    });

    const resolvedMonitored = buildMonitoredRepresentatives({
      employees: resolvedSim.employees,
      summaries: resolvedSim.summaries,
      attendanceRecords: resolvedSim.attendanceRecords,
      telemetryMap: resolvedSim.telemetryMap,
      todayStr,
      nowMs: baseNowMs + 8000,
    });

    expect(resolvedMonitored.every((m) => m.alerts.length === 0)).toBe(true);

    const secondPass = reconcileAlertEpisodes({
      previousEpisodes: firstPass.nextEpisodes,
      monitoredList: resolvedMonitored,
      nowMs: baseNowMs + 8000,
    });
    expect(secondPass.resolvedEpisodes.length).toBe(
      firstPass.newlyTriggered.length
    );
    expect(secondPass.nextEpisodes.size).toBe(0);
  });

  it('يحرك إحداثيات المتصلين فقط ويبقي المنقطعين ثابتين عند آخر موقع معروف', () => {
    let sim = applySimulationScenario({
      realEmployees: [],
      realSummaries: {},
      realAttendanceRecords: {},
      realTelemetryMap: {},
      previousState: createInactiveSimulationState(),
      scenario: 'trigger_gps_disconnect',
      todayStr,
      nowMs: baseNowMs,
    });

    const onlineBefore = { ...sim.telemetryMap.SIM001 };
    const offlineBefore = { ...sim.telemetryMap.SIM005 };
    expect(offlineBefore.isOnline).toBe(false);

    sim = advanceSimulationGpsStep(sim, baseNowMs + 3000);

    const onlineAfter = sim.telemetryMap.SIM001;
    const offlineAfter = sim.telemetryMap.SIM005;

    expect(
      onlineAfter.lat !== onlineBefore.lat || onlineAfter.lng !== onlineBefore.lng
    ).toBe(true);
    expect(onlineAfter.gpsUpdatedAtMs).toBe(baseNowMs + 3000);

    // المندوب غير المتصل لم يتحرك وظل محتفظاً بآخر موقع معروف له
    expect(offlineAfter.lat).toBe(offlineBefore.lat);
    expect(offlineAfter.lng).toBe(offlineBefore.lng);
    expect(offlineAfter.gpsUpdatedAtMs).toBe(offlineBefore.gpsUpdatedAtMs);
  });
});
