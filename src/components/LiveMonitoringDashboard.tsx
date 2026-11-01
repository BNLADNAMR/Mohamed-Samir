import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMapView,
  MapMouseEvent,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  CloudUpload,
  Crosshair,
  Edit3,
  FlaskConical,
  History,
  LocateFixed,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  EmployeeSummary,
  MonitoredRepresentative,
  RepAlertLogRecord,
  RepBatchId,
  RepLiveTelemetry,
  SecurityPolicySettings,
  Team,
  UserProfile,
} from '../types';
import {
  ALL_REP_BATCHES,
  LiveAlertFilterMode,
  filterMonitoredRepresentatives,
  formatGpsAgeAr,
  playSmartAlertSound,
  sortMonitoredRepresentatives,
} from '../utils/liveMonitoringEngine';
import { canEditRepLiveTelemetry } from '../utils/rbac';
import { upsertRepLiveTelemetry } from '../services/firestoreService';
import {
  LiveSimulationController,
  SimulationScenarioId,
} from '../utils/liveSimulationEngine';

interface LiveMonitoringDashboardProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  monitoredReps: MonitoredRepresentative[];
  teams: Team[];
  alertLogs: RepAlertLogRecord[];
  todayStr: string;
  nowMs: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  simulation: LiveSimulationController;
  onInspectEmployeeInGrid: (emp: Employee) => void;
  onNotify: (
    message: string,
    type?: 'success' | 'info' | 'warning' | 'error'
  ) => void;
}

const DEFAULT_EGYPT_CENTER = { lat: 30.0444, lng: 31.2357 };

/**
 * متحكم كاميرا الخريطة للتحريك السلس إلى المندوب المحدد أو احتواء جميع المواقع المتاحة
 */
const MapViewportController: React.FC<{
  selectedRep: MonitoredRepresentative | null;
  repsWithGps: MonitoredRepresentative[];
  fitBoundsTrigger: number;
}> = ({ selectedRep, repsWithGps, fitBoundsTrigger }) => {
  const map = useMap('full-live-map');
  const coreLib = useMapsLibrary('core');

  // عند اختيار مندوب يمتلك إحداثيات GPS صالحة، ننتقل إليه بسلاسة
  useEffect(() => {
    if (!map || !selectedRep || !selectedRep.telemetry.hasGpsFix) return;
    map.panTo({
      lat: selectedRep.telemetry.lat,
      lng: selectedRep.telemetry.lng,
    });
    const currentZoom = map.getZoom() ?? 11;
    if (currentZoom < 14) {
      map.setZoom(15);
    }
  }, [
    map,
    selectedRep?.employee.id,
    selectedRep?.telemetry.hasGpsFix,
    selectedRep?.telemetry.lat,
    selectedRep?.telemetry.lng,
  ]);

  // احتواء جميع المناديب الظاهرين على الخريطة عند طلب المستخدم أو التحميل الأولي
  useEffect(() => {
    if (!map || repsWithGps.length === 0) return;
    if (repsWithGps.length === 1) {
      map.panTo({
        lat: repsWithGps[0].telemetry.lat,
        lng: repsWithGps[0].telemetry.lng,
      });
      map.setZoom(14);
      return;
    }

    if (coreLib?.LatLngBounds) {
      const bounds = new coreLib.LatLngBounds();
      repsWithGps.forEach((r) => {
        bounds.extend({ lat: r.telemetry.lat, lng: r.telemetry.lng });
      });
      map.fitBounds(bounds, 56);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, coreLib, fitBoundsTrigger, repsWithGps.length]);

  return null;
};

function formatCurrencyEgp(amount: number): string {
  if (!Number.isFinite(amount)) return '0 ج.م';
  return `${amount.toLocaleString('ar-EG', {
    maximumFractionDigits: 2,
  })} ج.م`;
}

function formatAlertTimestampAr(ms: number): string {
  if (!ms || ms <= 0) return '—';
  return new Date(ms).toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getTodayAttendanceBadge(record?: AttendanceRecord): {
  label: string;
  className: string;
} {
  if (!record) {
    return {
      label: 'لا يوجد سجل لليوم بعد',
      className:
        'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    };
  }
  switch (record.attendance) {
    case 'worked':
      return {
        label: `حاضر بالعمل (${Number(
          ((record.totalWorkedMinutes || 0) / 60).toFixed(1)
        )} س)`,
        className:
          'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      };
    case 'absent':
      return {
        label: 'غائب مسجل اليوم',
        className:
          'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      };
    case 'leave':
      return {
        label: 'إجازة معتمدة',
        className:
          'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      };
    case 'day_off':
      return {
        label: 'يوم راحة',
        className:
          'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 border-stone-300 dark:border-slate-700',
      };
    default:
      return {
        label:
          record.shiftSelection === 'selected'
            ? 'شفت محجوز · بانتظار الحضور'
            : 'قيد المتابعة',
        className:
          'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
      };
  }
}

export const LiveMonitoringDashboard: React.FC<LiveMonitoringDashboardProps> = ({
  currentUser,
  securityPolicy,
  monitoredReps,
  teams,
  alertLogs,
  todayStr,
  nowMs,
  soundEnabled,
  onToggleSound,
  simulation,
  onInspectEmployeeInGrid,
  onNotify,
}) => {
  const [alertFilter, setAlertFilter] = useState<LiveAlertFilterMode>('all');
  const [batchFilter, setBatchFilter] = useState<'all' | RepBatchId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [sidebarLimit, setSidebarLimit] = useState(60);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(1);
  const [isSimBarOpen, setIsSimBarOpen] = useState<boolean>(false);
  const [dismissedBannerEpisodes, setDismissedBannerEpisodes] = useState<
    Record<string, boolean>
  >({});

  const triggerSimScenario = (scenario: SimulationScenarioId) => {
    setIsSimBarOpen(true);
    simulation.startOrApplyScenario(scenario);
    setFitBoundsTrigger((n) => n + 1);
  };

  // نافذة تحديث بيانات المحفظة والباتش والموقع الميداني للمشرف/العمليات/المدير
  const [telemetryEditorRep, setTelemetryEditorRep] =
    useState<MonitoredRepresentative | null>(null);
  const [editBatch, setEditBatch] = useState<RepBatchId>('Batch 1');
  const [editWallet, setEditWallet] = useState<string>('0');
  const [editIsOnline, setEditIsOnline] = useState<boolean>(true);
  const [editIncludeGps, setEditIncludeGps] = useState<boolean>(false);
  const [editLat, setEditLat] = useState<string>('');
  const [editLng, setEditLng] = useState<string>('');
  const [editAccuracy, setEditAccuracy] = useState<string>('15');
  const [isPickingOnMap, setIsPickingOnMap] = useState<boolean>(false);
  const [isSavingTelemetry, setIsSavingTelemetry] = useState<boolean>(false);
  const [isFetchingBrowserGps, setIsFetchingBrowserGps] =
    useState<boolean>(false);

  // نافذة سجل التنبيهات التاريخي
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    'all' | 'active' | 'resolved'
  >('all');
  const [historySeverityFilter, setHistorySeverityFilter] = useState<
    'all' | 'red' | 'orange'
  >('all');

  const teamsById = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((t) => {
      map[t.teamId] = t;
    });
    return map;
  }, [teams]);

  // 1. ترتيب جميع المناديب العاملين حالياً حسب الأولوية المعتمدة (الأحمر -> البرتقالي -> الأعلى أداءً)
  const prioritySortedAll = useMemo(
    () => sortMonitoredRepresentatives(monitoredReps),
    [monitoredReps]
  );

  // 2. تطبيق الفلاتر والبحث الفوري دون الإخلال بترتيب الأولوية
  const filteredReps = useMemo(
    () =>
      filterMonitoredRepresentatives(prioritySortedAll, {
        alertFilter,
        batchFilter,
        searchQuery,
      }),
    [prioritySortedAll, alertFilter, batchFilter, searchQuery]
  );

  const visibleSidebarReps = useMemo(
    () => filteredReps.slice(0, sidebarLimit),
    [filteredReps, sidebarLimit]
  );

  const repsWithValidGps = useMemo(
    () =>
      filteredReps.filter(
        (r) =>
          r.telemetry.hasGpsFix &&
          Number.isFinite(r.telemetry.lat) &&
          Number.isFinite(r.telemetry.lng)
      ),
    [filteredReps]
  );

  // 3. المؤشرات الفورية العلوية أعلى الخريطة (Live KPIs)
  const kpiStats = useMemo(() => {
    let redCount = 0;
    let orangeCount = 0;
    let normalCount = 0;
    let offlineCount = 0;
    let latestGpsMs = 0;

    for (const item of prioritySortedAll) {
      if (item.primarySeverity === 'red') {
        redCount++;
      }
      if (item.alerts.some((a) => a.severity === 'orange')) {
        orangeCount++;
      }
      if (item.alerts.length === 0) {
        normalCount++;
      }
      if (item.connectionState !== 'online') {
        offlineCount++;
      }
      if (item.telemetry.gpsUpdatedAtMs > latestGpsMs) {
        latestGpsMs = item.telemetry.gpsUpdatedAtMs;
      }
    }

    return {
      totalActiveWorking: prioritySortedAll.length,
      redCount,
      orangeCount,
      normalCount,
      offlineCount,
      latestGpsMs,
    };
  }, [prioritySortedAll]);

  // المندوب المحدد حالياً لعرض بطاقة بياناته وأدائه الكاملة
  const selectedRep = useMemo(
    () =>
      prioritySortedAll.find((r) => r.employee.id === selectedRepId) || null,
    [prioritySortedAll, selectedRepId]
  );

  // شريط التنبيهات الفورية الحية أعلى الخريطة (يعرض الحالات النشطة غير المخفاة مؤقتاً)
  const activeAlertBanners = useMemo(() => {
    const items: {
      rep: MonitoredRepresentative;
      episodeKey: string;
      severity: 'red' | 'orange';
      titleAr: string;
      reason: string;
    }[] = [];

    for (const rep of prioritySortedAll) {
      for (const alrt of rep.alerts) {
        if (dismissedBannerEpisodes[alrt.episodeKey]) continue;
        items.push({
          rep,
          episodeKey: alrt.episodeKey,
          severity: alrt.severity,
          titleAr: alrt.titleAr,
          reason: alrt.reason,
        });
      }
    }

    return items.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1;
      return 0;
    });
  }, [prioritySortedAll, dismissedBannerEpisodes]);

  const openTelemetryEditor = useCallback((rep: MonitoredRepresentative) => {
    setTelemetryEditorRep(rep);
    setEditBatch(rep.telemetry.batch || 'Batch 1');
    setEditWallet(String(rep.telemetry.walletBalance ?? 0));
    setEditIsOnline(
      rep.telemetry.hasGpsFix ? Boolean(rep.telemetry.isOnline) : true
    );
    setEditIncludeGps(Boolean(rep.telemetry.hasGpsFix));
    setEditLat(
      rep.telemetry.hasGpsFix
        ? String(rep.telemetry.lat)
        : String(DEFAULT_EGYPT_CENTER.lat)
    );
    setEditLng(
      rep.telemetry.hasGpsFix
        ? String(rep.telemetry.lng)
        : String(DEFAULT_EGYPT_CENTER.lng)
    );
    setEditAccuracy(String(rep.telemetry.accuracy || 15));
    setIsPickingOnMap(false);
  }, []);

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      if (!isPickingOnMap || !ev.detail.latLng) return;
      const { lat, lng } = ev.detail.latLng;
      setEditIncludeGps(true);
      setEditLat(lat.toFixed(6));
      setEditLng(lng.toFixed(6));
      setIsPickingOnMap(false);
      onNotify(
        `تم التقاط الموقع من الخريطة (${lat.toFixed(5)}, ${lng.toFixed(5)}) — اضغط حفظ لتأكيد التحديث.`,
        'info'
      );
    },
    [isPickingOnMap, onNotify]
  );

  const handleCaptureBrowserGpsIntoForm = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify('المتصفح الحالي لا يدعم خدمة تحديد الموقع الجغرافي GPS.', 'warning');
      return;
    }
    setIsFetchingBrowserGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditIncludeGps(true);
        setEditLat(pos.coords.latitude.toFixed(6));
        setEditLng(pos.coords.longitude.toFixed(6));
        setEditAccuracy(String(Math.round(pos.coords.accuracy || 15)));
        setIsFetchingBrowserGps(false);
        onNotify('تم جلب إحداثيات GPS المباشرة من الجهاز بنجاح.', 'success');
      },
      (err) => {
        setIsFetchingBrowserGps(false);
        onNotify(
          err.code === 1
            ? 'تم رفض إذن الموقع الجغرافي من المتصفح.'
            : 'تعذر قراءة إشارة GPS الحالية — يمكنك إدخال الإحداثيات أو النقر على الخريطة.',
          'warning'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSaveTelemetrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telemetryEditorRep) return;

    const parsedWallet = Number(editWallet);
    if (!Number.isFinite(parsedWallet) || parsedWallet < 0) {
      onNotify('يرجى إدخال قيمة محفظة صحيحة (0 أو أكثر بالجنيه المصري).', 'error');
      return;
    }

    let gpsPayload: {
      lat: number;
      lng: number;
      accuracy: number;
      gpsUpdatedAtMs: number;
    } | null = null;

    if (editIncludeGps) {
      const parsedLat = Number(editLat);
      const parsedLng = Number(editLng);
      const parsedAcc = Number(editAccuracy) || 15;
      if (
        !Number.isFinite(parsedLat) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        !Number.isFinite(parsedLng) ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        onNotify(
          'إحداثيات خط العرض أو خط الطول غير صالحة (Lat: -90..90, Lng: -180..180).',
          'error'
        );
        return;
      }
      gpsPayload = {
        lat: parsedLat,
        lng: parsedLng,
        accuracy: parsedAcc,
        gpsUpdatedAtMs: Date.now(),
      };
    }

    setIsSavingTelemetry(true);
    try {
      await upsertRepLiveTelemetry({
        actor: currentUser,
        employee: telemetryEditorRep.employee,
        batch: editBatch,
        walletBalance: parsedWallet,
        isOnline: editIsOnline,
        gps: gpsPayload,
      });
      setSelectedRepId(telemetryEditorRep.employee.id);
      setTelemetryEditorRep(null);
      onNotify(
        `تم تحديث بيانات المراقبة الحية للمندوب ${telemetryEditorRep.employee.fullName} بنجاح.`,
        'success'
      );
    } catch {
      onNotify('تعذر حفظ تحديث المحفظة / الموقع للمندوب.', 'error');
    } finally {
      setIsSavingTelemetry(false);
    }
  };

  const filteredHistoryLogs = useMemo(() => {
    return [...alertLogs]
      .filter((log) => {
        if (historyStatusFilter !== 'all' && log.status !== historyStatusFilter) {
          return false;
        }
        if (
          historySeverityFilter !== 'all' &&
          log.severity !== historySeverityFilter
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (b.triggeredAtMs || 0) - (a.triggeredAtMs || 0));
  }, [alertLogs, historyStatusFilter, historySeverityFilter]);

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-[1900px] w-full mx-auto space-y-4">
      {/* 1. رأس لوحة المراقبة الحية للمناديب وأدوات الصوت والسجل التاريخي */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  لوحة المراقبة الحية للمناديب والتنبيهات الذكية
                </h1>
                <span className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-bold">
                  · بث لحظي ({todayStr})
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                متابعة فورية لمواقع GPS، المحافظ النقدية، الباتشات (Batch 1–6)، وترتيب المناديب حسب الأولوية والأداء الفعلي المسجل بالنظام
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleSound}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                soundEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              title="كتم أو تفعيل الإشعار الصوتي الفوري للتنبيهات"
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>التنبيه الصوتي: مفعل</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-slate-500" />
                  <span>التنبيه الصوتي: مكتوم</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => playSmartAlertSound('red')}
              className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="اختبار وضوح الإشعار الصوتي في المتصفح"
            >
              <Bell className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>اختبار الصوت</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSimBarOpen((prev) => !prev)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-extrabold border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                simulation.isActive || isSimBarOpen
                  ? 'bg-amber-600 hover:bg-amber-500 border-amber-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100'
              }`}
              title="فتح أو إغلاق معمل محاكاة واختبار السيستم"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>
                {simulation.isActive ? 'محاكاة الاختبار: نشطة' : 'محاكاة الاختبار'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <History className="w-3.5 h-3.5" />
              <span>سجل التنبيهات التاريخي</span>
              <span className="font-mono tabular-nums text-[11px] opacity-90">
                ({alertLogs.length})
              </span>
            </button>
          </div>
        </div>

        {(isSimBarOpen || simulation.isActive) && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-slate-800/80 p-3.5 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 shrink-0" />
                <span>
                  محاكاة واختبار السيستم الفوري (تختبر حركة GPS، التنبيهات، والصوت دون تعديل سجلات الحضور الفعلية)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {!simulation.isActive ? (
                  <button
                    type="button"
                    onClick={() => triggerSimScenario('balanced_fleet')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>تشغيل المحاكاة</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={simulation.toggleAutoMove}
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 border cursor-pointer ${
                        simulation.isAutoMoving
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      {simulation.isAutoMoving ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>حركة GPS التلقائية: نشطة</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>حركة GPS التلقائية: متوقفة</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={simulation.stepOnce}
                      className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
                    >
                      خطوة +1
                    </button>

                    {simulation.canSyncCloud && (
                      <button
                        type="button"
                        disabled={simulation.isSyncingCloud}
                        onClick={() => void simulation.syncSimulationToCloud()}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>
                          {simulation.isSyncingCloud ? 'جارٍ الحفظ...' : 'حفظ بالسحابة'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={simulation.stopSimulation}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إيقاف المحاكاة</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => triggerSimScenario('trigger_red_alert')}
                className="px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 hover:border-rose-500 text-rose-700 dark:text-rose-300 font-bold cursor-pointer"
              >
                🔴 اختبار تنبيه أحمر (أداء)
              </button>
              <button
                type="button"
                onClick={() => triggerSimScenario('trigger_orange_456')}
                className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 hover:border-amber-500 text-amber-700 dark:text-amber-300 font-bold cursor-pointer"
              >
                🟠 برتقالي Batch 4-6 (&gt;2000 ج.م)
              </button>
              <button
                type="button"
                onClick={() => triggerSimScenario('trigger_orange_123')}
                className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 hover:border-amber-500 text-amber-700 dark:text-amber-300 font-bold cursor-pointer"
              >
                🟠 برتقالي Batch 1-3 (&gt;2500 ج.م)
              </button>
              <button
                type="button"
                onClick={() => triggerSimScenario('trigger_combined_red_orange')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-rose-500 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
              >
                🔴+🟠 اجتماع الأحمر والبرتقالي
              </button>
              <button
                type="button"
                onClick={() => triggerSimScenario('trigger_gps_disconnect')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
              >
                📡 انقطاع GPS (آخر موقع معروف)
              </button>
              <button
                type="button"
                onClick={() => triggerSimScenario('resolve_all_alerts')}
                className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 hover:border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer"
              >
                ✅ معالجة وإغلاق التنبيهات تلقائياً
              </button>
            </div>
          </div>
        )}

        {/* 2. شريط المؤشرات الفورية (KPI Strip) أعلى الخريطة */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setAlertFilter('all')}
            className={`text-right p-3 rounded-xl border transition-colors cursor-pointer ${
              alertFilter === 'all'
                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-700'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
            }`}
          >
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              المناديب العاملون حالياً
            </span>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {kpiStats.totalActiveWorking}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-bold">
                {repsWithValidGps.length} على الخريطة
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setAlertFilter((prev) => (prev === 'red' ? 'all' : 'red'))
            }
            className={`text-right p-3 rounded-xl border transition-colors cursor-pointer ${
              alertFilter === 'red'
                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 dark:border-rose-700'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-rose-400'
            }`}
          >
            <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block">
              التنبيهات الحمراء (أداء)
            </span>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-2xl font-extrabold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                {kpiStats.redCount}
              </span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                أولوية قصوى 1
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setAlertFilter((prev) => (prev === 'orange' ? 'all' : 'orange'))
            }
            className={`text-right p-3 rounded-xl border transition-colors cursor-pointer ${
              alertFilter === 'orange'
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 dark:border-amber-700'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-amber-400'
            }`}
          >
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block">
              تنبيهات المحافظ البرتقالية
            </span>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-2xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                {kpiStats.orangeCount}
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                أولوية 2 (&gt;2000 / 2500)
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setAlertFilter((prev) => (prev === 'normal' ? 'all' : 'normal'))
            }
            className={`text-right p-3 rounded-xl border transition-colors cursor-pointer ${
              alertFilter === 'normal'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 dark:border-emerald-700'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-emerald-400'
            }`}
          >
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block">
              مناديب بدون تنبيهات
            </span>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {kpiStats.normalCount}
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                وضع تشغيلي سليم
              </span>
            </div>
          </button>

          <div className="text-right p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              غير متصلين / توقف GPS
            </span>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {kpiStats.offlineCount}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                يعرض آخر موقع معروف
              </span>
            </div>
          </div>

          <div className="text-right p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              آخر تحديث لمواقع GPS
            </span>
            <div className="mt-1.5">
              <div className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {kpiStats.latestGpsMs > 0
                  ? new Date(kpiStats.latestGpsMs).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'بانتظار الإشارة'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {kpiStats.latestGpsMs > 0
                  ? formatGpsAgeAr(
                      Math.max(0, nowMs - kpiStats.latestGpsMs),
                      kpiStats.latestGpsMs
                    )
                  : 'لا توجد إحداثيات مسجلة بعد'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. شريط التنبيهات الفورية الحية (يظهر طالما الحالة قائمة ويزول تلقائياً فور انتهاء الشرط) */}
      {activeAlertBanners.length > 0 && (
        <section
          aria-live="polite"
          className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900/80 rounded-xl p-3.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-rose-700 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                تنبيهات فورية قائمة حالياً ({activeAlertBanners.length}) — تختفي تلقائياً فور معالجة السبب
              </span>
            </div>
            {Object.keys(dismissedBannerEpisodes).length > 0 && (
              <button
                type="button"
                onClick={() => setDismissedBannerEpisodes({})}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                إظهار كل التنبيهات المخفاة مؤقتاً
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-44 overflow-y-auto pr-0.5">
            {activeAlertBanners.slice(0, 9).map((banner) => {
              const isRed = banner.severity === 'red';
              return (
                <div
                  key={banner.episodeKey}
                  className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 text-xs ${
                    isRed
                      ? 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                      : 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-extrabold truncate">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isRed ? 'bg-rose-600' : 'bg-amber-500'
                        }`}
                      />
                      <span className="truncate">{banner.rep.employee.fullName}</span>
                      <span className="font-mono tabular-nums text-[11px] opacity-80">
                        ({banner.rep.employee.employeeCode})
                      </span>
                    </div>
                    <p className="text-[11px] font-bold leading-snug">
                      {banner.reason}
                    </p>
                    <div className="text-[10px] font-mono tabular-nums opacity-85">
                      {banner.rep.telemetry.batch} · المحفظة:{' '}
                      {formatCurrencyEgp(banner.rep.telemetry.walletBalance)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedRepId(banner.rep.employee.id)}
                      className={`px-2 py-1 rounded text-[11px] font-bold text-white cursor-pointer ${
                        isRed
                          ? 'bg-rose-600 hover:bg-rose-500'
                          : 'bg-amber-600 hover:bg-amber-500'
                      }`}
                    >
                      تحديد
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissedBannerEpisodes((prev) => ({
                          ...prev,
                          [banner.episodeKey]: true,
                        }))
                      }
                      className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                      title="إخفاء الشريط العلوي مع بقاء التنبيه في القائمة والخريطة"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. شريط الفلترة والبحث المتقدم */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'red', label: 'التنبيهات الحمراء فقط' },
                { id: 'orange', label: 'التنبيهات البرتقالية فقط' },
                { id: 'normal', label: 'بدون تنبيهات فقط' },
              ] as { id: LiveAlertFilterMode; label: string }[]
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setAlertFilter(btn.id)}
                className={`px-2.5 py-1.5 rounded-md font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  alertFilter === btn.id
                    ? btn.id === 'red'
                      ? 'bg-rose-600 text-white'
                      : btn.id === 'orange'
                      ? 'bg-amber-600 text-white'
                      : btn.id === 'normal'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 dark:bg-indigo-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={batchFilter}
              onChange={(e) =>
                setBatchFilter(e.target.value as 'all' | RepBatchId)
              }
              aria-label="فلترة حسب رقم الباتش"
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">كل الباتشات (Batch 1 – 6)</option>
              {ALL_REP_BATCHES.map((b) => (
                <option key={b} value={b}>
                  {b} (حد المحفظة:{' '}
                  {b === 'Batch 4' || b === 'Batch 5' || b === 'Batch 6'
                    ? '2000 ج.م'
                    : '2500 ج.م'}
                  )
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
          <div className="relative min-w-[240px] flex-1 sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم المندوب أو الكود / ID..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pr-8 pl-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2 top-2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFitBoundsTrigger((n) => n + 1)}
            disabled={repsWithValidGps.length === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            title="احتواء جميع المناديب الظاهرين على الخريطة"
          >
            <LocateFixed className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>احتواء الخريطة</span>
          </button>
        </div>
      </section>

      {/* 5. الشبكة الرئيسية: الخريطة التفاعلية المباشرة + القائمة الجانبية المرتبة حسب الأولوية */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* القسم الأيمن في الشبكة (8 أعمدة): خريطة Google المباشرة + بطاقة تفاصيل المندوب المحدد */}
        <div className="xl:col-span-8 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {/* شريط مفتاح الألوان أعلى الخريطة + وضع النقر لتحديد موقع */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-3 font-bold">
                <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                  أحمر: تنبيه أداء فوري
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  برتقالي: تجاوز حد المحفظة
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  أخضر: متصل سليم
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  رمادي: Offline / آخر موقع معروف
                </span>
              </div>

              {isPickingOnMap && telemetryEditorRep && (
                <div className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1 rounded-lg font-extrabold">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>
                    انقر على أي نقطة في الخريطة لتعيين موقع:{' '}
                    {telemetryEditorRep.employee.fullName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPickingOnMap(false)}
                    className="underline text-indigo-100 hover:text-white ml-1 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>

            {/* حاوية الخريطة بارتفاع صريح لمنع انهيار أبعاد الخريطة (CF2) */}
            <div className="relative w-full h-[540px] xl:h-[640px] bg-slate-100 dark:bg-slate-950">
              {!mapsApiKey ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <MapPin className="w-8 h-8 text-slate-400" />
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    مفتاح خرائط Google غير مهيأ في بيئة التشغيل الحالية
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                    يرجى التأكد من توفر المتغير البيئي VITE_GOOGLE_MAPS_API_KEY لعرض الخريطة التفاعلية. جميع بيانات المناديب والتنبيهات متاحة بالكامل في القائمة الجانبية.
                  </p>
                </div>
              ) : (
                <GoogleMapView
                  id="full-live-map"
                  mapId="DEMO_MAP_ID"
                  defaultCenter={DEFAULT_EGYPT_CENTER}
                  defaultZoom={11}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  internalUsageAttributionIds={[
                    'gmp_mcp_codeassist_v1_aistudio',
                  ]}
                  onClick={handleMapClick}
                  className="w-full h-full"
                >
                    <MapViewportController
                      selectedRep={selectedRep}
                      repsWithGps={repsWithValidGps}
                      fitBoundsTrigger={fitBoundsTrigger}
                    />

                    {repsWithValidGps.map((item) => {
                      const isSelected = selectedRep?.employee.id === item.employee.id;
                      const headerBg =
                        item.markerTone === 'red'
                          ? 'bg-rose-600 border-rose-700 text-white'
                          : item.markerTone === 'orange'
                          ? 'bg-amber-600 border-amber-700 text-white'
                          : item.markerTone === 'green'
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : 'bg-slate-600 border-slate-700 text-white';

                      const zIndex =
                        isSelected
                          ? 1000
                          : item.primarySeverity === 'red'
                          ? 500
                          : item.primarySeverity === 'orange'
                          ? 300
                          : 100;

                      return (
                        <AdvancedMarker
                          key={item.employee.id}
                          position={{
                            lat: item.telemetry.lat,
                            lng: item.telemetry.lng,
                          }}
                          zIndex={zIndex}
                          onClick={() => setSelectedRepId(item.employee.id)}
                        >
                          <div
                            dir="rtl"
                            className={`group cursor-pointer select-none transition-transform ${
                              isSelected ? 'scale-105' : 'hover:scale-105'
                            }`}
                          >
                            <div
                              className={`rounded-xl shadow-lg border-2 overflow-hidden min-w-[156px] max-w-[210px] ${
                                isSelected
                                  ? 'ring-3 ring-indigo-500 border-white'
                                  : 'border-white dark:border-slate-900'
                              }`}
                            >
                              {/* الشريط العلوي لعلامة المندوب على الخريطة */}
                              <div
                                className={`px-2.5 py-1 flex items-center justify-between gap-1.5 text-[11px] font-extrabold ${headerBg}`}
                              >
                                <span className="truncate">
                                  {item.employee.fullName}
                                </span>
                                <span className="font-mono tabular-nums text-[10px] opacity-95 shrink-0">
                                  {item.employee.employeeCode}
                                </span>
                              </div>

                              {/* تفاصيل المحفظة والباتش وحالة الاتصال مباشرة على الخريطة */}
                              <div className="bg-white/95 dark:bg-slate-900/95 px-2.5 py-1.5 text-[10px] text-slate-800 dark:text-slate-100 space-y-0.5">
                                <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                                  <span className="font-extrabold text-indigo-700 dark:text-indigo-300">
                                    {item.telemetry.batch}
                                  </span>
                                  <span className="font-extrabold">
                                    {formatCurrencyEgp(item.telemetry.walletBalance)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-1 text-[9px] text-slate-500 dark:text-slate-400">
                                  <span className="truncate font-bold">
                                    {item.connectionState === 'online'
                                      ? 'Online'
                                      : 'Offline · آخر موقع'}
                                  </span>
                                  {item.alerts.length > 0 && (
                                    <span
                                      className={`font-extrabold truncate ${
                                        item.primarySeverity === 'red'
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {item.alerts.length > 1
                                        ? `${item.alerts.length} تنبيهات`
                                        : item.primarySeverity === 'red'
                                        ? 'تنبيه أحمر'
                                        : 'تنبيه محفظة'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* سهم الدبوس السفلي */}
                            <div className="flex justify-center -mt-1">
                              <div
                                className={`w-3 h-3 rotate-45 ${
                                  item.markerTone === 'red'
                                    ? 'bg-rose-600'
                                    : item.markerTone === 'orange'
                                    ? 'bg-amber-600'
                                    : item.markerTone === 'green'
                                    ? 'bg-emerald-600'
                                    : 'bg-slate-600'
                                }`}
                              />
                            </div>
                          </div>
                        </AdvancedMarker>
                      );
                    })}
                </GoogleMapView>
              )}

              {/* إشعار إرشادي هادئ إذا لم يسجل أي مندوب إحداثيات GPS بعد */}
              {mapsApiKey && repsWithValidGps.length === 0 && (
                <div className="absolute bottom-4 right-4 left-4 sm:left-auto sm:max-w-md bg-slate-900/90 text-white p-3.5 rounded-xl border border-slate-700 text-xs space-y-1.5 pointer-events-auto">
                  <div className="font-extrabold flex items-center gap-1.5 text-amber-300">
                    <Navigation className="w-4 h-4 shrink-0" />
                    <span>لا توجد إحداثيات GPS نشطة للمناديب ضمن الفلتر الحالي</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    تظهر العلامات على الخريطة فور قيام المندوب بتفعيل مشاركة موقعه المباشر من «بوابتي الشخصية»، أو عند تحديث موقع المندوب من القائمة الجانبية بواسطة المشرف أو مدير التشغيل.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* بطاقة الفحص الكامل لبيانات وأداء المندوب الفعلي من قاعدة البيانات الحالية عند الضغط عليه */}
          {selectedRep && (
            <section className="bg-white dark:bg-slate-900 border-2 border-indigo-500/70 dark:border-indigo-500/60 rounded-xl p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {selectedRep.employee.fullName}
                    </h2>
                    <span className="font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      {selectedRep.employee.employeeCode}
                    </span>
                    <span className="font-mono tabular-nums font-extrabold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {selectedRep.telemetry.batch}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded border font-bold ${
                        selectedRep.connectionState === 'online'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {selectedRep.statusLabelAr}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400">
                    <span>
                      الفريق:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {teamsById[selectedRep.employee.teamId || '']?.teamName ||
                          selectedRep.employee.teamId ||
                          'غير محدد'}
                      </strong>
                    </span>
                    {selectedRep.employee.phone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr" className="font-mono tabular-nums">
                          {selectedRep.employee.phone}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      حالة اليوم ({todayStr}):{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {getTodayAttendanceBadge(selectedRep.todayRecord).label}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEditRepLiveTelemetry(
                    currentUser,
                    selectedRep.employee,
                    securityPolicy
                  ) && (
                    <button
                      type="button"
                      onClick={() => openTelemetryEditor(selectedRep)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تحديث المحفظة / الباتش / GPS</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onInspectEmployeeInGrid(selectedRep.employee)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>فتح سجله في الجدول الشهري</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRepId(null)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                    title="إغلاق بطاقة المندوب"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* إظهار جميع التنبيهات القائمة للمندوب (الأحمر والبرتقالي معاً دون إخفاء أي منهما) */}
              {selectedRep.alerts.length > 0 && (
                <div className="space-y-2">
                  <div className="font-extrabold text-slate-800 dark:text-slate-200">
                    التنبيهات النشطة المسجلة على المندوب ({selectedRep.alerts.length}):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedRep.alerts.map((alrt) => (
                      <div
                        key={alrt.episodeKey}
                        className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                          alrt.severity === 'red'
                            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                            : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                        }`}
                      >
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            alrt.severity === 'red'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        />
                        <div>
                          <div className="font-extrabold">{alrt.titleAr}</div>
                          <div className="text-[11px] font-bold mt-0.5">
                            السبب: {alrt.reason}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* بيانات الأداء الفعلي من النظام الحالي + المحفظة وإشارة GPS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    قيمة المحفظة الحالية
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                    {formatCurrencyEgp(selectedRep.telemetry.walletBalance)}
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    نسبة الأداء الشهري
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                    {selectedRep.summary.performanceRate !== null
                      ? `${selectedRep.summary.performanceRate}%`
                      : 'غير متاح'}
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    معدل الالتزام بالحضور
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-indigo-700 dark:text-indigo-400 mt-0.5 block">
                    {selectedRep.summary.commitmentRate !== null
                      ? `${selectedRep.summary.commitmentRate}%`
                      : '—'}
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    أيام العمل الفعلية
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                    {selectedRep.summary.workedDays} يوم
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    إجمالي الساعات
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                    {selectedRep.summary.totalHours} س (معدل{' '}
                    {selectedRep.summary.avgHours} س)
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    أيام الغياب المسجلة
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-rose-700 dark:text-rose-400 mt-0.5 block">
                    {selectedRep.summary.absentDays} يوم
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    اختار شفت ولم يعمل
                  </span>
                  <strong className="text-sm font-extrabold font-mono tabular-nums text-rose-700 dark:text-rose-400 mt-0.5 block">
                    {selectedRep.summary.selectedNotWorkedDays} يوم
                  </strong>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    توقيت آخر إشارة GPS
                  </span>
                  <strong className="text-[11px] font-extrabold font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {formatGpsAgeAr(
                      selectedRep.gpsAgeMs,
                      selectedRep.telemetry.gpsUpdatedAtMs
                    )}
                  </strong>
                  {selectedRep.telemetry.hasGpsFix && (
                    <span
                      dir="ltr"
                      className="text-[9px] font-mono tabular-nums text-slate-500 block mt-0.5"
                    >
                      {selectedRep.telemetry.lat.toFixed(4)},{' '}
                      {selectedRep.telemetry.lng.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* القسم الأيسر في الشبكة (4 أعمدة): القائمة الجانبية المرتبة تلقائياً حسب الأولوية */}
        <aside className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[760px]">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                قائمة أولويات المناديب المباشرة ({filteredReps.length})
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                مرتبة: 1. تنبيه أحمر · 2. تنبيه برتقالي · 3. الأعلى أداءً
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {visibleSidebarReps.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  لا يوجد مناديب مطابقون لمعايير الفلترة الحالية
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAlertFilter('all');
                    setBatchFilter('all');
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                >
                  إعادة ضبط الفلاتر
                </button>
              </div>
            ) : (
              visibleSidebarReps.map((item, idx) => {
                const isSelected = selectedRep?.employee.id === item.employee.id;
                const canEditThisRep = canEditRepLiveTelemetry(
                  currentUser,
                  item.employee,
                  securityPolicy
                );

                const rowBorderClass =
                  item.primarySeverity === 'red'
                    ? 'border-r-4 border-r-rose-600 bg-rose-50/40 dark:bg-rose-950/20'
                    : item.primarySeverity === 'orange'
                    ? 'border-r-4 border-r-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                    : 'border-r-4 border-r-emerald-500/70';

                return (
                  <div
                    key={item.employee.id}
                    onClick={() => setSelectedRepId(item.employee.id)}
                    className={`p-3 transition-colors cursor-pointer ${rowBorderClass} ${
                      isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono tabular-nums text-slate-400">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {item.employee.fullName}
                          </span>
                          <span className="text-[10px] font-mono tabular-nums font-bold text-slate-500 dark:text-slate-400 shrink-0">
                            ({item.employee.employeeCode})
                          </span>
                        </div>

                        {/* سبب التنبيه بجوار اسم المندوب (يعرض جميع التنبيهات في حال وجود أحمر + برتقالي معاً) */}
                        {item.alerts.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {item.alerts.map((alrt) => (
                              <div
                                key={alrt.episodeKey}
                                className={`text-[11px] font-bold flex items-center gap-1 ${
                                  alrt.severity === 'red'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    alrt.severity === 'red'
                                      ? 'bg-rose-600'
                                      : 'bg-amber-500'
                                  }`}
                                />
                                <span>{alrt.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono tabular-nums font-extrabold text-indigo-700 dark:text-indigo-300">
                          {item.telemetry.batch}
                        </span>
                        {canEditThisRep && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTelemetryEditor(item);
                            }}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                            title="تحديث المحفظة أو الباتش أو إحداثيات GPS"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* صف الأرقام الأساسية: الأداء الفعلي + المحفظة + حالة الاتصال وإشارة GPS */}
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span>
                          الأداء:{' '}
                          <strong
                            className={
                              (item.summary.performanceRate ?? 0) >= 80
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }
                          >
                            {item.summary.performanceRate !== null
                              ? `${item.summary.performanceRate}%`
                              : '—'}
                          </strong>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Wallet className="w-3 h-3 text-slate-400" />
                          <strong className="text-slate-900 dark:text-white">
                            {formatCurrencyEgp(item.telemetry.walletBalance)}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        {item.connectionState === 'online' ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                            <Wifi className="w-3 h-3" />
                            <span>Online</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-slate-500 dark:text-slate-400">
                            <WifiOff className="w-3 h-3" />
                            <span>
                              {item.telemetry.hasGpsFix
                                ? `آخر موقع (${formatGpsAgeAr(
                                    item.gpsAgeMs,
                                    item.telemetry.gpsUpdatedAtMs
                                  )})`
                                : 'بانتظار GPS'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {filteredReps.length > sidebarLimit && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setSidebarLimit((prev) => prev + 60)}
                  className="w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  عرض المزيد من المناديب ({filteredReps.length - sidebarLimit}{' '}
                  متبقٍ)
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* نافذة تحديث المحفظة والباتش والموقع الحي للمندوب */}
      {telemetryEditorRep && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  تحديث بيانات المحفظة والباتش والموقع المباشر
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {telemetryEditorRep.employee.fullName} (
                  {telemetryEditorRep.employee.employeeCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTelemetryEditorRep(null);
                  setIsPickingOnMap(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTelemetrySubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الباتش (Batch)
                  </label>
                  <select
                    value={editBatch}
                    onChange={(e) => setEditBatch(e.target.value as RepBatchId)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-bold text-slate-900 dark:text-white"
                  >
                    {ALL_REP_BATCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    قيمة المحفظة الحالية (جنيه مصري)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10000000"
                    value={editWallet}
                    onChange={(e) => setEditWallet(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-mono tabular-nums font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    حد التنبيه البرتقالي لهذا الباتش:{' '}
                    {editBatch === 'Batch 4' ||
                    editBatch === 'Batch 5' ||
                    editBatch === 'Batch 6'
                      ? 'أكبر من 2000 ج.م'
                      : 'أكبر من 2500 ج.م'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    حالة اتصال المندوب (Online / Active)
                  </div>
                  <div className="text-[10px] text-slate-500">
                    في حال الإيقاف يظهر آخر موقع معروف مع توقيت التوقف
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editIsOnline}
                  onChange={(e) => setEditIsOnline(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIncludeGps}
                      onChange={(e) => setEditIncludeGps(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span>تحديث إحداثيات موقع GPS على الخريطة</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isFetchingBrowserGps}
                      onClick={handleCaptureBrowserGpsIntoForm}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isFetchingBrowserGps ? 'جارٍ الجلب...' : 'موقعي الحالي GPS'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPickingOnMap(true);
                        onNotify(
                          'انقر على الموقع المطلوب فوق الخريطة لالتقاط الإحداثيات تلقائياً.',
                          'info'
                        );
                      }}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                    >
                      تحديد بالنقر على الخريطة
                    </button>
                  </div>
                </div>

                {editIncludeGps && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        خط العرض (Latitude)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={editLat}
                        onChange={(e) => setEditLat(e.target.value)}
                        dir="ltr"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        خط الطول (Longitude)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={editLng}
                        onChange={(e) => setEditLng(e.target.value)}
                        dir="ltr"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-mono tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTelemetryEditorRep(null);
                    setIsPickingOnMap(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingTelemetry}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {isSavingTelemetry ? 'جارٍ الحفظ اللحظي...' : 'حفظ التحديثات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة سجل التنبيهات الذكية التاريخي (/repAlertLogs) */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>السجل التاريخي للتنبيهات الذكية للمناديب</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  يوثق وقت انطلاق كل تنبيه (أحمر أو برتقالي) ووقت انتهائه التلقائي فور زوال الشرط
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={historySeverityFilter}
                  onChange={(e) =>
                    setHistorySeverityFilter(
                      e.target.value as 'all' | 'red' | 'orange'
                    )
                  }
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold"
                >
                  <option value="all">كل الدرجات</option>
                  <option value="red">تنبيه أحمر فقط</option>
                  <option value="orange">تنبيه برتقالي فقط</option>
                </select>

                <select
                  value={historyStatusFilter}
                  onChange={(e) =>
                    setHistoryStatusFilter(
                      e.target.value as 'all' | 'active' | 'resolved'
                    )
                  }
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold"
                >
                  <option value="all">كل الحالات</option>
                  <option value="active">نشط حالياً</option>
                  <option value="resolved">منتهٍ تلقائياً</option>
                </select>

                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredHistoryLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-bold">
                  لا توجد سجلات تنبيهات مطابقة في السجل التاريخي حتى الآن.
                </div>
              ) : (
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <th className="py-2 px-2.5 font-extrabold">المندوب</th>
                      <th className="py-2 px-2.5 font-extrabold">النوع والسبب</th>
                      <th className="py-2 px-2.5 font-extrabold">الباتش / المحفظة</th>
                      <th className="py-2 px-2.5 font-extrabold">وقت البدء</th>
                      <th className="py-2 px-2.5 font-extrabold">الحالة / وقت الانتهاء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredHistoryLogs.map((log) => (
                      <tr
                        key={log.alertId}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2.5 px-2.5">
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {log.employeeName}
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-slate-500">
                            {log.employeeCode}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold mb-1 ${
                              log.severity === 'red'
                                ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300'
                                : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {log.severity === 'red'
                              ? 'تنبيه أحمر (أداء)'
                              : 'تنبيه برتقالي (محفظة)'}
                          </span>
                          <div className="font-bold text-slate-700 dark:text-slate-200">
                            {log.reason}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono tabular-nums">
                          <div className="font-bold">{log.batch}</div>
                          <div className="text-slate-500">
                            {formatCurrencyEgp(log.walletBalance)}
                          </div>
                        </td>
                        <td
                          dir="ltr"
                          className="py-2.5 px-2.5 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300 text-right"
                        >
                          {formatAlertTimestampAr(log.triggeredAtMs)}
                        </td>
                        <td className="py-2.5 px-2.5">
                          {log.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-extrabold text-[10px]">
                              <Clock className="w-3 h-3" />
                              قائم حالياً
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-extrabold text-[10px]">
                                <CheckCircle2 className="w-3 h-3" />
                                انتهى تلقائياً
                              </span>
                              <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
                                {formatAlertTimestampAr(log.resolvedAtMs)}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
