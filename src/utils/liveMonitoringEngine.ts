import {
  ActiveRepAlert,
  AttendanceRecord,
  Employee,
  EmployeeSummary,
  MonitoredRepresentative,
  RepBatchId,
  RepConnectionState,
  RepLiveTelemetry,
  RepSmartAlertSeverity,
  RepSmartAlertType,
} from '../types';

export const GPS_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 دقائق لاعتبار الإشارة قديمة (Stale)
export const BATCH_456_WALLET_LIMIT = 2000;
export const BATCH_123_WALLET_LIMIT = 2500;

export const ALL_REP_BATCHES: RepBatchId[] = [
  'Batch 1',
  'Batch 2',
  'Batch 3',
  'Batch 4',
  'Batch 5',
  'Batch 6',
];

export type LiveAlertFilterMode = 'all' | 'red' | 'orange' | 'normal';

export interface ActiveEpisodeTrackerEntry {
  episodeKey: string;
  alertId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  teamId: string;
  severity: RepSmartAlertSeverity;
  alertType: RepSmartAlertType;
  reason: string;
  batch: RepBatchId;
  walletBalance: number;
  performanceRate: number;
  triggeredAtMs: number;
}

export function isValidRepBatch(val: unknown): val is RepBatchId {
  return (
    typeof val === 'string' &&
    (ALL_REP_BATCHES as readonly string[]).includes(val)
  );
}

/**
 * بناء كائن القياس المباشر الافتراضي الآمن للمندوب عند عدم تسجيل إشارة GPS بعد،
 * دون اختلاق أي موقع جغرافي وهمي أو بيانات أداء افتراضية.
 */
export function buildDefaultTelemetryForEmployee(
  employee: Employee
): RepLiveTelemetry {
  return {
    employeeId: employee.id,
    teamId: employee.teamId || '',
    userId: employee.userId || '',
    batch: 'Batch 1',
    walletBalance: 0,
    hasGpsFix: false,
    lat: 0,
    lng: 0,
    accuracy: 0,
    isOnline: false,
    gpsUpdatedAtMs: 0,
    updatedBy: 'system',
  };
}

/**
 * تقييم التنبيهات الذكية للمندوب اعتماداً على بيانات الأداء الفعلية المسجلة بالنظام
 * (نفس شرط المتابعة العاجلة/التنبيه الأحمر في النظام الحالي: وجود غياب مسجل أو حجز شفت دون حضور فعلي)
 * وقيمة المحفظة والباتش (Batch 4/5/6 > 2000 جنيه، و Batch 1/2/3 > 2500 جنيه).
 * في حال تحقق التنبيه الأحمر والبرتقالي معاً، تبقى الأولوية للأحمر مع الاحتفاظ بكلا التنبيهين.
 */
export function evaluateRepresentativeAlerts(params: {
  employee: Employee;
  summary: EmployeeSummary;
  telemetry: RepLiveTelemetry;
}): {
  alerts: ActiveRepAlert[];
  primarySeverity: 'red' | 'orange' | 'none';
} {
  const { employee, summary, telemetry } = params;
  const alerts: ActiveRepAlert[] = [];

  // 1. التنبيه الأحمر (Priority 1): مرتبط بمعيار الأداء الفعلي المعتمد في النظام الحالي دون اختراع حد جديد
  const absentDays = summary?.absentDays ?? 0;
  const missedShiftDays = summary?.selectedNotWorkedDays ?? 0;
  if (absentDays > 0 || missedShiftDays > 0) {
    const reasonsParts: string[] = [];
    if (absentDays > 0) {
      reasonsParts.push(`مسجل غياب (${absentDays} يوم)`);
    }
    if (missedShiftDays > 0) {
      reasonsParts.push(`اختار شفت ولم يعمل (${missedShiftDays} يوم)`);
    }
    alerts.push({
      episodeKey: `${employee.id}__performance_red`,
      employeeId: employee.id,
      severity: 'red',
      alertType: 'performance_red',
      titleAr: 'تنبيه أداء أحمر عاجل',
      reason: reasonsParts.join(' · '),
    });
  }

  // 2. التنبيه البرتقالي للمحافظ — Batch 4 و 5 و 6 (> 2000 جنيه مصري)
  const batch = telemetry.batch;
  const wallet = Number(telemetry.walletBalance) || 0;

  if (
    (batch === 'Batch 4' || batch === 'Batch 5' || batch === 'Batch 6') &&
    wallet > BATCH_456_WALLET_LIMIT
  ) {
    alerts.push({
      episodeKey: `${employee.id}__wallet_batch_456`,
      employeeId: employee.id,
      severity: 'orange',
      alertType: 'wallet_batch_456',
      titleAr: `تنبيه محفظة (${batch})`,
      reason: 'المحفظة تجاوزت 2000 جنيه',
    });
  }

  // 3. التنبيه البرتقالي للمحافظ — Batch 1 و 2 و 3 (> 2500 جنيه مصري)
  if (
    (batch === 'Batch 1' || batch === 'Batch 2' || batch === 'Batch 3') &&
    wallet > BATCH_123_WALLET_LIMIT
  ) {
    alerts.push({
      episodeKey: `${employee.id}__wallet_batch_123`,
      employeeId: employee.id,
      severity: 'orange',
      alertType: 'wallet_batch_123',
      titleAr: `تنبيه محفظة (${batch})`,
      reason: 'المحفظة تجاوزت 2500 جنيه',
    });
  }

  const hasRed = alerts.some((a) => a.severity === 'red');
  const hasOrange = alerts.some((a) => a.severity === 'orange');

  const primarySeverity: 'red' | 'orange' | 'none' = hasRed
    ? 'red'
    : hasOrange
    ? 'orange'
    : 'none';

  return { alerts, primarySeverity };
}

/**
 * حساب حالة اتصال المندوب وحداثة إشارة GPS بدقة
 */
export function resolveRepConnectionState(params: {
  telemetry: RepLiveTelemetry;
  todayRecord?: AttendanceRecord;
  nowMs: number;
}): {
  connectionState: RepConnectionState;
  statusLabelAr: string;
  gpsAgeMs: number | null;
} {
  const { telemetry, todayRecord, nowMs } = params;
  const hasValidGps =
    Boolean(telemetry.hasGpsFix) &&
    Number.isFinite(telemetry.lat) &&
    Number.isFinite(telemetry.lng) &&
    telemetry.gpsUpdatedAtMs > 0;

  const gpsAgeMs = hasValidGps
    ? Math.max(0, nowMs - telemetry.gpsUpdatedAtMs)
    : null;

  if (
    telemetry.isOnline &&
    hasValidGps &&
    gpsAgeMs !== null &&
    gpsAgeMs <= GPS_STALE_THRESHOLD_MS
  ) {
    const isWorkingShift = todayRecord?.attendance === 'worked';
    return {
      connectionState: 'online',
      statusLabelAr: isWorkingShift ? 'Active · متصل بالعمل' : 'Online · متصل مباشر',
      gpsAgeMs,
    };
  }

  if (hasValidGps && gpsAgeMs !== null) {
    return {
      connectionState: 'stale',
      statusLabelAr: telemetry.isOnline
        ? 'Offline · انقطع تحديث GPS'
        : 'Offline · آخر موقع معروف',
      gpsAgeMs,
    };
  }

  if (telemetry.isOnline || todayRecord?.attendance === 'worked') {
    return {
      connectionState: 'offline',
      statusLabelAr: 'Active · بانتظار إشارة GPS',
      gpsAgeMs: null,
    };
  }

  return {
    connectionState: 'offline',
    statusLabelAr: 'Offline · غير متصل',
    gpsAgeMs: null,
  };
}

/**
 * دمج المندوبين العاملين حالياً (status === 'active') مع بياناتهم الفعلية بالنظام والقياس المباشر
 */
export function buildMonitoredRepresentatives(params: {
  employees: Employee[];
  summaries: Record<string, EmployeeSummary>;
  attendanceRecords: Record<string, AttendanceRecord>;
  telemetryMap: Record<string, RepLiveTelemetry>;
  todayStr: string;
  nowMs: number;
}): MonitoredRepresentative[] {
  const {
    employees,
    summaries,
    attendanceRecords,
    telemetryMap,
    todayStr,
    nowMs,
  } = params;

  const defaultSummary: EmployeeSummary = {
    workedDays: 0,
    absentDays: 0,
    leaveDays: 0,
    dayOffDays: 0,
    selectedDays: 0,
    selectedNotWorkedDays: 0,
    totalHours: 0,
    avgHours: 0,
    commitmentRate: null,
    performanceRate: null,
    remainingDays: 0,
  };

  return employees
    .filter((emp) => emp.status === 'active')
    .map((emp) => {
      const summary = summaries[emp.id] || defaultSummary;
      const todayRecord = attendanceRecords[`${emp.id}_${todayStr}`];
      const telemetry =
        telemetryMap[emp.id] || buildDefaultTelemetryForEmployee(emp);

      const { alerts, primarySeverity } = evaluateRepresentativeAlerts({
        employee: emp,
        summary,
        telemetry,
      });

      const { connectionState, statusLabelAr, gpsAgeMs } =
        resolveRepConnectionState({
          telemetry,
          todayRecord,
          nowMs,
        });

      const markerTone: MonitoredRepresentative['markerTone'] =
        primarySeverity === 'red'
          ? 'red'
          : primarySeverity === 'orange'
          ? 'orange'
          : connectionState === 'online'
          ? 'green'
          : 'offline';

      return {
        employee: emp,
        summary,
        todayRecord,
        telemetry,
        connectionState,
        statusLabelAr,
        gpsAgeMs,
        alerts,
        primarySeverity,
        markerTone,
      };
    });
}

/**
 * ترتيب المناديب تلقائياً حسب الأولوية المطلوبة:
 * 1. أصحاب التنبيه الأحمر أولاً
 * 2. أصحاب التنبيه البرتقالي ثانياً
 * 3. باقي المناديب حسب الأعلى أداءً كما هو معتمد في النظام الحالي
 */
export function sortMonitoredRepresentatives(
  list: MonitoredRepresentative[]
): MonitoredRepresentative[] {
  const severityRank = (sev: MonitoredRepresentative['primarySeverity']): number => {
    if (sev === 'red') return 0;
    if (sev === 'orange') return 1;
    return 2;
  };

  return [...list].sort((a, b) => {
    const rankDiff = severityRank(a.primarySeverity) - severityRank(b.primarySeverity);
    if (rankDiff !== 0) return rankDiff;

    // في حال التساوي في التنبيه البرتقالي، رتب بالأعلى قيمة في المحفظة ثم الأداء
    if (a.primarySeverity === 'orange' && b.primarySeverity === 'orange') {
      const walletDiff =
        (b.telemetry.walletBalance || 0) - (a.telemetry.walletBalance || 0);
      if (walletDiff !== 0) return walletDiff;
    }

    // الترتيب حسب الأداء الفعلي في النظام الحالي (performanceRate ثم commitmentRate ثم الساعات)
    const perfA = a.summary.performanceRate ?? a.summary.commitmentRate ?? -1;
    const perfB = b.summary.performanceRate ?? b.summary.commitmentRate ?? -1;
    if (perfB !== perfA) return perfB - perfA;

    const hoursDiff = (b.summary.totalHours ?? 0) - (a.summary.totalHours ?? 0);
    if (hoursDiff !== 0) return hoursDiff;

    const onlineA = a.connectionState === 'online' ? 1 : 0;
    const onlineB = b.connectionState === 'online' ? 1 : 0;
    if (onlineB !== onlineA) return onlineB - onlineA;

    return a.employee.employeeCode.localeCompare(
      b.employee.employeeCode,
      undefined,
      { numeric: true }
    );
  });
}

/**
 * فلترة وبحث فوري في قائمة المناديب وخريطة المراقبة
 */
export function filterMonitoredRepresentatives(
  list: MonitoredRepresentative[],
  filters: {
    alertFilter: LiveAlertFilterMode;
    batchFilter: 'all' | RepBatchId;
    searchQuery: string;
  }
): MonitoredRepresentative[] {
  const q = filters.searchQuery.trim().toLowerCase();

  return list.filter((item) => {
    if (filters.alertFilter === 'red' && item.primarySeverity !== 'red') {
      return false;
    }
    if (
      filters.alertFilter === 'orange' &&
      !item.alerts.some((a) => a.severity === 'orange')
    ) {
      return false;
    }
    if (filters.alertFilter === 'normal' && item.alerts.length > 0) {
      return false;
    }

    if (
      filters.batchFilter !== 'all' &&
      item.telemetry.batch !== filters.batchFilter
    ) {
      return false;
    }

    if (q) {
      const matchName = item.employee.fullName.toLowerCase().includes(q);
      const matchCode = item.employee.employeeCode.toLowerCase().includes(q);
      const matchId = item.employee.id.toLowerCase().includes(q);
      const matchPhone = item.employee.phone.includes(q);
      if (!matchName && !matchCode && !matchId && !matchPhone) {
        return false;
      }
    }

    return true;
  });
}

/**
 * تتبع حلقات التنبيه النشطة (Episode Reconciliation) لضمان:
 * - إطلاق التنبيه الصوتي والمرئي مرة واحدة فقط عند بدء الحالة وعدم تكراره كل ثانية مع تحديثات GPS
 * - إنهاء التنبيه تلقائياً فور زوال الشرط (مثل تسوية المحفظة أو تصحيح سجل الحضور)
 */
export function reconcileAlertEpisodes(params: {
  previousEpisodes: Map<string, ActiveEpisodeTrackerEntry>;
  monitoredList: MonitoredRepresentative[];
  nowMs: number;
}): {
  nextEpisodes: Map<string, ActiveEpisodeTrackerEntry>;
  newlyTriggered: ActiveEpisodeTrackerEntry[];
  resolvedEpisodes: {
    entry: ActiveEpisodeTrackerEntry;
    currentWalletBalance: number;
    currentPerformanceRate: number;
  }[];
} {
  const { previousEpisodes, monitoredList, nowMs } = params;
  const nextEpisodes = new Map<string, ActiveEpisodeTrackerEntry>();
  const newlyTriggered: ActiveEpisodeTrackerEntry[] = [];
  const resolvedEpisodes: {
    entry: ActiveEpisodeTrackerEntry;
    currentWalletBalance: number;
    currentPerformanceRate: number;
  }[] = [];

  const repById = new Map<string, MonitoredRepresentative>();
  monitoredList.forEach((rep) => {
    repById.set(rep.employee.id, rep);
  });

  // 1. فحص جميع التنبيهات القائمة حالياً
  for (const rep of monitoredList) {
    const perfRate =
      rep.summary.performanceRate !== null &&
      rep.summary.performanceRate !== undefined
        ? rep.summary.performanceRate
        : -1;

    for (const alert of rep.alerts) {
      const existing = previousEpisodes.get(alert.episodeKey);
      if (existing) {
        nextEpisodes.set(alert.episodeKey, {
          ...existing,
          reason: alert.reason,
          batch: rep.telemetry.batch,
          walletBalance: rep.telemetry.walletBalance,
          performanceRate: perfRate,
        });
      } else {
        const cleanEmpId = rep.employee.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const createdEntry: ActiveEpisodeTrackerEntry = {
          episodeKey: alert.episodeKey,
          alertId: `alrt_${cleanEmpId}_${alert.alertType}_${nowMs}`,
          employeeId: rep.employee.id,
          employeeCode: rep.employee.employeeCode,
          employeeName: rep.employee.fullName,
          teamId: rep.employee.teamId || '',
          severity: alert.severity,
          alertType: alert.alertType,
          reason: alert.reason,
          batch: rep.telemetry.batch,
          walletBalance: rep.telemetry.walletBalance,
          performanceRate: perfRate,
          triggeredAtMs: nowMs,
        };
        nextEpisodes.set(alert.episodeKey, createdEntry);
        newlyTriggered.push(createdEntry);
      }
    }
  }

  // 2. اكتشاف الحالات التي زال شرطها تلقائياً
  for (const [episodeKey, prevEntry] of previousEpisodes.entries()) {
    if (!nextEpisodes.has(episodeKey)) {
      const repNow = repById.get(prevEntry.employeeId);
      // لا نحسم الإغلاق التلقائي إلا إذا كان سجل المندوب موجوداً في القائمة النشطة وزال عنه الشرط فعلياً
      if (repNow) {
        const perfNow =
          repNow.summary.performanceRate !== null &&
          repNow.summary.performanceRate !== undefined
            ? repNow.summary.performanceRate
            : -1;
        resolvedEpisodes.push({
          entry: prevEntry,
          currentWalletBalance: repNow.telemetry.walletBalance,
          currentPerformanceRate: perfNow,
        });
      }
    }
  }

  return {
    nextEpisodes,
    newlyTriggered,
    resolvedEpisodes,
  };
}

/**
 * تنسيق المدة المنقضية منذ آخر تحديث لموقع GPS بالعربية
 */
export function formatGpsAgeAr(ageMs: number | null, timestampMs?: number): string {
  if (ageMs === null || !timestampMs || timestampMs <= 0) {
    return 'لا توجد إشارة GPS بعد';
  }
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 15) return 'الآن (مباشر)';
  if (seconds < 60) return `منذ ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return new Date(timestampMs).toLocaleString('ar-EG', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * تشغيل إشعار صوتي واضح ومميز للتنبيهات (أحمر مزدوج عاجل / برتقالي نغمة تنبيه محفظة)
 * باستخدام Web Audio API دون الحاجة لملفات صوت خارجية
 */
export function playSmartAlertSound(severity: RepSmartAlertSeverity): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (severity === 'red') {
      // نغمة تنبيه أحمر عاجل واضحة (نبضتان متتاليتان)
      const frequencies = [880, 660, 880];
      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.16);
        gain.gain.setValueAtTime(0.001, now + idx * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.16 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.16);
        osc.stop(now + idx * 0.16 + 0.15);
      });
      window.setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 800);
    } else {
      // نغمة تنبيه برتقالي للمحافظ (نغمة تنبيه ثنائية هادئة وواضحة)
      const frequencies = [587.33, 783.99];
      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);
        gain.gain.setValueAtTime(0.001, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.18 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.17);
      });
      window.setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 650);
    }
  } catch {
    // في حال حظر المتصفح تشغيل الصوت قبل تفاعل المستخدم لا نكسر التطبيق
  }
}
