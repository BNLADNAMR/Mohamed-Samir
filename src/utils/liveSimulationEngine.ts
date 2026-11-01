import {
  AttendanceRecord,
  Employee,
  EmployeeSummary,
  RepBatchId,
  RepLiveTelemetry,
} from '../types';
import { ALL_REP_BATCHES } from './liveMonitoringEngine';

export type SimulationScenarioId =
  | 'balanced_fleet'
  | 'trigger_red_alert'
  | 'trigger_orange_456'
  | 'trigger_orange_123'
  | 'trigger_combined_red_orange'
  | 'trigger_gps_disconnect'
  | 'resolve_all_alerts';

export interface LiveSimulationState {
  isActive: boolean;
  isAutoMoving: boolean;
  activeScenario: SimulationScenarioId | null;
  stepCount: number;
  usesSyntheticFleet: boolean;
  employees: Employee[];
  summaries: Record<string, EmployeeSummary>;
  attendanceRecords: Record<string, AttendanceRecord>;
  telemetryMap: Record<string, RepLiveTelemetry>;
}

export interface LiveSimulationController {
  isActive: boolean;
  isAutoMoving: boolean;
  activeScenario: SimulationScenarioId | null;
  stepCount: number;
  usesSyntheticFleet: boolean;
  isSyncingCloud: boolean;
  canSyncCloud: boolean;
  startOrApplyScenario: (scenario: SimulationScenarioId) => void;
  toggleAutoMove: () => void;
  stepOnce: () => void;
  syncSimulationToCloud: () => Promise<void>;
  stopSimulation: () => void;
}

export const SIMULATION_CENTER_LAT = 30.0444;
export const SIMULATION_CENTER_LNG = 31.2357;

const NUMERIC_COORDINATE_OFFSETS: ReadonlyArray<{ dLat: number; dLng: number }> = [
  { dLat: 0.014, dLng: 0.011 },
  { dLat: -0.012, dLng: 0.018 },
  { dLat: 0.021, dLng: -0.015 },
  { dLat: -0.019, dLng: -0.012 },
  { dLat: 0.008, dLng: -0.024 },
  { dLat: -0.024, dLng: 0.006 },
  { dLat: 0.027, dLng: 0.019 },
  { dLat: -0.007, dLng: 0.028 },
  { dLat: 0.017, dLng: 0.003 },
  { dLat: -0.015, dLng: -0.023 },
];

const SYNTHETIC_REP_NAMES: ReadonlyArray<string> = [
  'أحمد السيد (محاكاة)',
  'محمد الشريف (محاكاة)',
  'محمود عبدالله (محاكاة)',
  'عمر النجار (محاكاة)',
  'خالد منصور (محاكاة)',
  'كريم فاروق (محاكاة)',
  'يوسف سالم (محاكاة)',
  'طارق حمدي (محاكاة)',
];

const SAFE_WALLET_VALUES: ReadonlyArray<number> = [
  840, 1120, 650, 1390, 975, 1480, 730, 1210,
];

export function createInactiveSimulationState(): LiveSimulationState {
  return {
    isActive: false,
    isAutoMoving: false,
    activeScenario: null,
    stepCount: 0,
    usesSyntheticFleet: false,
    employees: [],
    summaries: {},
    attendanceRecords: {},
    telemetryMap: {},
  };
}

function buildSyntheticFleet(todayStr: string): {
  employees: Employee[];
  summaries: Record<string, EmployeeSummary>;
  attendanceRecords: Record<string, AttendanceRecord>;
} {
  const employees: Employee[] = [];
  const summaries: Record<string, EmployeeSummary> = {};
  const attendanceRecords: Record<string, AttendanceRecord> = {};

  SYNTHETIC_REP_NAMES.forEach((fullName, idx) => {
    const code = `SIM${String(idx + 1).padStart(3, '0')}`;
    employees.push({
      id: code,
      employeeCode: code,
      fullName,
      phone: `01090000${String(100 + idx)}`,
      hireDate: '2025-01-01',
      status: 'active',
      externalId: `SIM_EXT_${idx + 1}`,
      teamId: '',
      userId: '',
      notes: 'مندوب افتراضي مؤقت لاختبار نظام المراقبة الحية',
    });

    const workedDays = Math.max(10, 22 - idx);
    const totalHours = workedDays * 8;
    const perfRate = Math.min(99, Math.max(78, 97 - idx * 2));

    summaries[code] = {
      workedDays,
      absentDays: 0,
      leaveDays: 1,
      dayOffDays: 2,
      selectedDays: workedDays,
      selectedNotWorkedDays: 0,
      totalHours,
      avgHours: 8,
      commitmentRate: perfRate,
      performanceRate: perfRate,
      remainingDays: 2,
    };

    attendanceRecords[`${code}_${todayStr}`] = {
      id: `${code}_${todayStr}`,
      employeeId: code,
      teamId: '',
      date: todayStr,
      shiftSelection: 'selected',
      attendance: 'worked',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      totalWorkedMinutes: 450,
      source: 'manual',
      updatedAt: `${todayStr}T09:00:00.000Z`,
    };
  });

  return { employees, summaries, attendanceRecords };
}

function cloneSummary(summary?: EmployeeSummary): EmployeeSummary {
  if (!summary) {
    return {
      workedDays: 14,
      absentDays: 0,
      leaveDays: 0,
      dayOffDays: 2,
      selectedDays: 14,
      selectedNotWorkedDays: 0,
      totalHours: 112,
      avgHours: 8,
      commitmentRate: 92,
      performanceRate: 92,
      remainingDays: 2,
    };
  }
  return { ...summary };
}

/**
 * إنشاء أو تحديث لقطة المحاكاة التفاعلية لاختبار الخريطة الحية والتنبيهات الذكية
 * دون المساس بقاعدة البيانات الأصلية أو اختلاق أسماء أماكن جغرافية.
 */
export function applySimulationScenario(params: {
  realEmployees: Employee[];
  realSummaries: Record<string, EmployeeSummary>;
  realAttendanceRecords: Record<string, AttendanceRecord>;
  realTelemetryMap: Record<string, RepLiveTelemetry>;
  previousState: LiveSimulationState;
  scenario: SimulationScenarioId;
  todayStr: string;
  nowMs: number;
}): LiveSimulationState {
  const {
    realEmployees,
    realSummaries,
    realAttendanceRecords,
    realTelemetryMap,
    previousState,
    scenario,
    todayStr,
    nowMs,
  } = params;

  const activeRealEmployees = realEmployees.filter((e) => e.status === 'active');
  const usesSyntheticFleet = activeRealEmployees.length === 0;

  let baseEmployees: Employee[];
  let baseSummaries: Record<string, EmployeeSummary>;
  let baseAttendance: Record<string, AttendanceRecord>;

  if (usesSyntheticFleet) {
    const synth = buildSyntheticFleet(todayStr);
    baseEmployees = synth.employees;
    baseSummaries = {};
    synth.employees.forEach((emp) => {
      baseSummaries[emp.id] =
        previousState.isActive &&
        previousState.usesSyntheticFleet &&
        previousState.summaries[emp.id]
          ? cloneSummary(previousState.summaries[emp.id])
          : cloneSummary(synth.summaries[emp.id]);
    });
    baseAttendance = synth.attendanceRecords;
  } else {
    baseEmployees = realEmployees.map((e) => ({ ...e }));
    baseSummaries = {};
    realEmployees.forEach((emp) => {
      baseSummaries[emp.id] =
        previousState.isActive &&
        !previousState.usesSyntheticFleet &&
        previousState.summaries[emp.id]
          ? cloneSummary(previousState.summaries[emp.id])
          : cloneSummary(realSummaries[emp.id]);
    });
    baseAttendance = { ...realAttendanceRecords };
  }

  const activeFleet = baseEmployees.filter((e) => e.status === 'active');
  const maxSimulatedGpsCount = Math.min(activeFleet.length, 24);
  const nextTelemetryMap: Record<string, RepLiveTelemetry> = {};

  // تهيئة مواقع GPS والمحافظ والباتشات الأساسية أو الاحتفاظ بالحالة الجارية عند تبديل السيناريو
  activeFleet.forEach((emp, idx) => {
    const prevTel = previousState.isActive
      ? previousState.telemetryMap[emp.id]
      : undefined;
    const realTel = realTelemetryMap[emp.id];

    const offset =
      NUMERIC_COORDINATE_OFFSETS[idx % NUMERIC_COORDINATE_OFFSETS.length];
    const ringScale = 1 + Math.floor(idx / NUMERIC_COORDINATE_OFFSETS.length) * 0.45;

    const fallbackLat = Number(
      (SIMULATION_CENTER_LAT + offset.dLat * ringScale).toFixed(6)
    );
    const fallbackLng = Number(
      (SIMULATION_CENTER_LNG + offset.dLng * ringScale).toFixed(6)
    );

    const hasExistingSimCoords =
      Boolean(prevTel?.hasGpsFix) &&
      Number.isFinite(prevTel?.lat) &&
      Number.isFinite(prevTel?.lng) &&
      (prevTel?.lat !== 0 || prevTel?.lng !== 0);

    const hasRealCoords =
      Boolean(realTel?.hasGpsFix) &&
      Number.isFinite(realTel?.lat) &&
      Number.isFinite(realTel?.lng) &&
      (realTel?.lat !== 0 || realTel?.lng !== 0);

    const shouldHaveGps = idx < maxSimulatedGpsCount || hasRealCoords;
    const defaultBatch = ALL_REP_BATCHES[idx % ALL_REP_BATCHES.length];
    const defaultWallet = SAFE_WALLET_VALUES[idx % SAFE_WALLET_VALUES.length];

    nextTelemetryMap[emp.id] = {
      employeeId: emp.id,
      teamId: emp.teamId || '',
      userId: emp.userId || '',
      batch: prevTel?.batch ?? realTel?.batch ?? defaultBatch,
      walletBalance:
        prevTel !== undefined
          ? prevTel.walletBalance
          : realTel && realTel.walletBalance > 0
          ? realTel.walletBalance
          : defaultWallet,
      hasGpsFix: shouldHaveGps,
      lat: hasExistingSimCoords
        ? prevTel!.lat
        : hasRealCoords
        ? realTel!.lat
        : shouldHaveGps
        ? fallbackLat
        : 0,
      lng: hasExistingSimCoords
        ? prevTel!.lng
        : hasRealCoords
        ? realTel!.lng
        : shouldHaveGps
        ? fallbackLng
        : 0,
      accuracy: prevTel?.accuracy || realTel?.accuracy || 12,
      isOnline: prevTel !== undefined ? prevTel.isOnline : shouldHaveGps,
      gpsUpdatedAtMs:
        prevTel !== undefined
          ? prevTel.isOnline
            ? nowMs
            : prevTel.gpsUpdatedAtMs
          : shouldHaveGps
          ? nowMs
          : 0,
      updatedBy: 'live_simulation',
    };
  });

  // اختيار مناديب مستهدفين لتطبيق السيناريو المطلوب بوضوح تام حتى لو كان العدد محدوداً
  const pickTarget = (preferredIndex: number): Employee | undefined => {
    if (activeFleet.length === 0) return undefined;
    return activeFleet[preferredIndex % activeFleet.length];
  };

  if (scenario === 'balanced_fleet') {
    // تشغيل متوازن للأسطول مع توزيع الباتشات ومحافظ ضمن الحدود الآمنة وإشارات GPS نشطة
    activeFleet.slice(0, maxSimulatedGpsCount).forEach((emp, idx) => {
      const tel = nextTelemetryMap[emp.id];
      if (!tel) return;
      tel.batch = ALL_REP_BATCHES[idx % ALL_REP_BATCHES.length];
      tel.walletBalance = SAFE_WALLET_VALUES[idx % SAFE_WALLET_VALUES.length];
      tel.isOnline = true;
      tel.hasGpsFix = true;
      tel.gpsUpdatedAtMs = nowMs;
      // استعادة الملخص الحقيقي عند إعادة ضبط الأسطول المتوازن
      if (!usesSyntheticFleet && realSummaries[emp.id]) {
        baseSummaries[emp.id] = cloneSummary(realSummaries[emp.id]);
      }
    });
  } else if (scenario === 'trigger_red_alert') {
    const target = pickTarget(0);
    if (target) {
      const sum = cloneSummary(baseSummaries[target.id]);
      if (sum.absentDays === 0 && sum.selectedNotWorkedDays === 0) {
        sum.absentDays = 1;
        sum.selectedNotWorkedDays = 1;
        sum.performanceRate = Math.min(sum.performanceRate ?? 72, 72);
      }
      baseSummaries[target.id] = sum;
      if (nextTelemetryMap[target.id]) {
        nextTelemetryMap[target.id] = {
          ...nextTelemetryMap[target.id],
          hasGpsFix: true,
          isOnline: true,
          gpsUpdatedAtMs: nowMs,
        };
      }
    }
  } else if (scenario === 'trigger_orange_456') {
    const target = pickTarget(1);
    if (target && nextTelemetryMap[target.id]) {
      const targetBatches: RepBatchId[] = ['Batch 4', 'Batch 5', 'Batch 6'];
      const chosenBatch = targetBatches[activeFleet.indexOf(target) % 3] || 'Batch 5';
      // التأكد من عدم وجود تنبيه أحمر على هذا المندوب لعرض اللون البرتقالي الصريح على الخريطة
      const cleanSum = cloneSummary(baseSummaries[target.id]);
      cleanSum.absentDays = 0;
      cleanSum.selectedNotWorkedDays = 0;
      baseSummaries[target.id] = cleanSum;

      nextTelemetryMap[target.id] = {
        ...nextTelemetryMap[target.id],
        batch: chosenBatch,
        walletBalance: 2380,
        hasGpsFix: true,
        isOnline: true,
        gpsUpdatedAtMs: nowMs,
      };
    }
  } else if (scenario === 'trigger_orange_123') {
    const target = pickTarget(2);
    if (target && nextTelemetryMap[target.id]) {
      const targetBatches: RepBatchId[] = ['Batch 1', 'Batch 2', 'Batch 3'];
      const chosenBatch = targetBatches[activeFleet.indexOf(target) % 3] || 'Batch 2';
      const cleanSum = cloneSummary(baseSummaries[target.id]);
      cleanSum.absentDays = 0;
      cleanSum.selectedNotWorkedDays = 0;
      baseSummaries[target.id] = cleanSum;

      nextTelemetryMap[target.id] = {
        ...nextTelemetryMap[target.id],
        batch: chosenBatch,
        walletBalance: 2890,
        hasGpsFix: true,
        isOnline: true,
        gpsUpdatedAtMs: nowMs,
      };
    }
  } else if (scenario === 'trigger_combined_red_orange') {
    const target = pickTarget(3);
    if (target && nextTelemetryMap[target.id]) {
      const sum = cloneSummary(baseSummaries[target.id]);
      sum.absentDays = Math.max(1, sum.absentDays);
      sum.selectedNotWorkedDays = Math.max(1, sum.selectedNotWorkedDays);
      baseSummaries[target.id] = sum;

      nextTelemetryMap[target.id] = {
        ...nextTelemetryMap[target.id],
        batch: 'Batch 6',
        walletBalance: 2460,
        hasGpsFix: true,
        isOnline: true,
        gpsUpdatedAtMs: nowMs,
      };
    }
  } else if (scenario === 'trigger_gps_disconnect') {
    const target = pickTarget(4);
    if (target && nextTelemetryMap[target.id]) {
      nextTelemetryMap[target.id] = {
        ...nextTelemetryMap[target.id],
        hasGpsFix: true,
        isOnline: false,
        // إشارة قديمة منذ 8 دقائق لاختبار عرض "Offline · آخر موقع معروف"
        gpsUpdatedAtMs: nowMs - 8 * 60 * 1000,
      };
    }
  } else if (scenario === 'resolve_all_alerts') {
    // تصفير جميع شروط التنبيه في بيئة المحاكاة لاختبار الإغلاق التلقائي الفوري للتنبيهات
    activeFleet.forEach((emp, idx) => {
      const cleanSum = cloneSummary(baseSummaries[emp.id]);
      cleanSum.absentDays = 0;
      cleanSum.selectedNotWorkedDays = 0;
      cleanSum.performanceRate = Math.max(cleanSum.performanceRate ?? 94, 90);
      baseSummaries[emp.id] = cleanSum;

      if (nextTelemetryMap[emp.id]) {
        nextTelemetryMap[emp.id] = {
          ...nextTelemetryMap[emp.id],
          walletBalance: SAFE_WALLET_VALUES[idx % SAFE_WALLET_VALUES.length],
          isOnline: idx < maxSimulatedGpsCount,
          hasGpsFix: idx < maxSimulatedGpsCount,
          gpsUpdatedAtMs: idx < maxSimulatedGpsCount ? nowMs : 0,
        };
      }
    });
  }

  return {
    isActive: true,
    isAutoMoving: previousState.isActive ? previousState.isAutoMoving : true,
    activeScenario: scenario,
    stepCount: previousState.stepCount + 1,
    usesSyntheticFleet,
    employees: baseEmployees,
    summaries: baseSummaries,
    attendanceRecords: baseAttendance,
    telemetryMap: nextTelemetryMap,
  };
}

/**
 * تحريك إحداثيات GPS خطوة زمنية واحدة للمناديب المتصلين فقط،
 * مع إبقاء المناديب المنقطعين (Offline) ثابتين عند آخر موقع معروف لهم.
 */
export function advanceSimulationGpsStep(
  state: LiveSimulationState,
  nowMs: number
): LiveSimulationState {
  if (!state.isActive) return state;

  const nextStep = state.stepCount + 1;
  const nextTelemetryMap: Record<string, RepLiveTelemetry> = {};

  Object.entries(state.telemetryMap).forEach(([empId, tel], idx) => {
    if (!tel.hasGpsFix || !tel.isOnline) {
      // المندوب غير المتصل يحتفظ بآخر موقع معروف وتوقيت الإشارة القديم دون تحريك
      nextTelemetryMap[empId] = tel;
      return;
    }

    const angle = (nextStep * 0.55 + idx * 1.15) % (Math.PI * 2);
    const deltaLat = Math.sin(angle) * 0.00055;
    const deltaLng = Math.cos(angle) * 0.00065;

    // الحفاظ على نطاق الحركة قريباً من المركز لتجنب شتات الدبابيس خارج المشهد
    const rawLat = tel.lat + deltaLat;
    const rawLng = tel.lng + deltaLng;
    const clampedLat = Math.max(
      SIMULATION_CENTER_LAT - 0.08,
      Math.min(SIMULATION_CENTER_LAT + 0.08, rawLat)
    );
    const clampedLng = Math.max(
      SIMULATION_CENTER_LNG - 0.08,
      Math.min(SIMULATION_CENTER_LNG + 0.08, rawLng)
    );

    nextTelemetryMap[empId] = {
      ...tel,
      lat: Number(clampedLat.toFixed(6)),
      lng: Number(clampedLng.toFixed(6)),
      accuracy: 8 + ((nextStep + idx) % 9),
      gpsUpdatedAtMs: nowMs,
    };
  });

  return {
    ...state,
    stepCount: nextStep,
    telemetryMap: nextTelemetryMap,
  };
}

export const SIMULATION_SCENARIO_LABELS_AR: Record<
  SimulationScenarioId,
  string
> = {
  balanced_fleet: 'تشغيل الأسطول المتكامل',
  trigger_red_alert: 'اختبار التنبيه الأحمر (أداء)',
  trigger_orange_456: 'اختبار برتقالي Batch 4/5/6 (> 2000 ج.م)',
  trigger_orange_123: 'اختبار برتقالي Batch 1/2/3 (> 2500 ج.م)',
  trigger_combined_red_orange: 'اختبار اجتماع الأحمر + البرتقالي معاً',
  trigger_gps_disconnect: 'اختبار انقطاع GPS (آخر موقع معروف)',
  resolve_all_alerts: 'اختبار المعالجة والإغلاق التلقائي للتنبيهات',
};
