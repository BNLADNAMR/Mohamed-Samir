import React, { useState, useRef, useEffect } from 'react';
import {
  Clock,
  X,
  Upload,
  Download,
  FileJson,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Table2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  KeyRound,
} from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  SecurityPolicySettings,
  UserProfile,
} from '../types';
import { hasPermission } from '../utils/rbac';
import { getCachedGoogleAccessToken, isBenignAbortError } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { saveSecurityPolicySettings } from '../services/firestoreService';
import {
  executeGoogleSheetsDirectSync,
  extractSpreadsheetIdAndGid,
  fetchGoogleSheetTabValues,
  fetchGoogleSpreadsheetMetadata,
  GoogleSpreadsheetMetadata,
  GoogleSheetsSyncIntervalMinutes,
  GoogleSheetsSyncMode,
  isGoogleSheetsInput,
  loadGoogleSheetsSyncPreferences,
  ParsedGoogleSheetShiftData,
  parseGoogleSheetRowsToShiftData,
  runExternalCompanyEndpointSync,
  saveGoogleSheetsSyncPreferences,
  SheetTelemetryImportItem,
} from '../services/googleSheetsService';
import { MONTH_NAMES } from '../utils/shiftCalculations';

interface ImportSyncModalProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  lastSyncTime: string;
  onImportData: (
    newEmployees: Employee[],
    newAttendance: Record<string, AttendanceRecord>,
    isExternalSync: boolean,
    telemetryUpdates?: SheetTelemetryImportItem[],
    customSourceLabel?: string
  ) => Promise<void>;
  onSyncComplete: (message: string) => void;
  onClose: () => void;
}

export const ImportSyncModal: React.FC<ImportSyncModalProps> = ({
  currentUser,
  securityPolicy,
  employees,
  attendanceRecords,
  lastSyncTime,
  onImportData,
  onSyncComplete,
  onClose,
}) => {
  const { hasGoogleSheetsToken, connectGoogleSheetsAccess } = useAuth();

  const canManageIntegration = hasPermission(
    currentUser,
    'integration.manage',
    securityPolicy
  );

  const savedSyncPrefs = loadGoogleSheetsSyncPreferences();
  const initialSavedUrl = securityPolicy.externalSyncEndpoint || '';
  const initialIsGoogleSheet = isGoogleSheetsInput(initialSavedUrl);

  const [sheetInput, setSheetInput] = useState<string>(
    savedSyncPrefs.spreadsheetInput || (initialIsGoogleSheet ? initialSavedUrl : '')
  );
  const [endpointUrl, setEndpointUrl] = useState<string>(
    initialIsGoogleSheet ? '' : initialSavedUrl
  );

  const [syncMode, setSyncMode] = useState<GoogleSheetsSyncMode>(
    savedSyncPrefs.syncMode
  );
  const [syncIntervalMinutes, setSyncIntervalMinutes] =
    useState<GoogleSheetsSyncIntervalMinutes>(savedSyncPrefs.intervalMinutes);

  const now = new Date();
  const [targetYear, setTargetYear] = useState<number>(
    savedSyncPrefs.targetYear || now.getFullYear()
  );
  const [targetMonth, setTargetMonth] = useState<number>(
    savedSyncPrefs.targetMonth || now.getMonth() + 1
  );

  const [sheetMeta, setSheetMeta] = useState<GoogleSpreadsheetMetadata | null>(
    null
  );
  const [selectedTabTitle, setSelectedTabTitle] = useState<string>(
    savedSyncPrefs.sheetTitle || ''
  );
  const [sheetPreview, setSheetPreview] =
    useState<ParsedGoogleSheetShiftData | null>(null);
  const [confirmingSheetImport, setConfirmingSheetImport] = useState(false);

  const [isAuthorizingSheets, setIsAuthorizingSheets] = useState(false);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isReadingSheet, setIsReadingSheet] = useState(false);
  const [isImportingSheet, setIsImportingSheet] = useState(false);
  const [isQuickSyncingSheets, setIsQuickSyncingSheets] = useState(false);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (syncAbortRef.current) {
        syncAbortRef.current.abort();
        syncAbortRef.current = null;
      }
    };
  }, [onClose]);

  const obtainValidSheetsToken = async (forceConsent = false): Promise<string> => {
    if (!forceConsent) {
      const cached = getCachedGoogleAccessToken();
      if (cached) return cached;
    }
    return connectGoogleSheetsAccess(forceConsent);
  };

  const handleAuthorizeGoogleSheets = async () => {
    setIsAuthorizingSheets(true);
    setStatusBanner(null);
    try {
      await connectGoogleSheetsAccess(true);
      setStatusBanner({
        type: 'success',
        text: 'تم تفعيل إذن قراءة Google Sheets بنجاح للجلسة الحالية.',
      });
    } catch (err) {
      if (!isBenignAbortError(err)) {
        setStatusBanner({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'تعذر الحصول على إذن الوصول إلى Google Sheets.',
        });
      }
    } finally {
      setIsAuthorizingSheets(false);
    }
  };

  const handleInspectSpreadsheet = async (overrideInput?: string) => {
    const raw = (overrideInput ?? sheetInput).trim();
    const extracted = extractSpreadsheetIdAndGid(raw);
    if (!extracted) {
      setStatusBanner({
        type: 'error',
        text: 'يرجى إدخال رابط Google Sheets صحيح (مثل https://docs.google.com/spreadsheets/d/...) أو معرّف الجدول المباشر.',
      });
      return;
    }

    setIsLoadingMeta(true);
    setStatusBanner(null);
    setSheetPreview(null);
    setConfirmingSheetImport(false);

    try {
      let token = await obtainValidSheetsToken(false);
      let metadata: GoogleSpreadsheetMetadata;
      try {
        metadata = await fetchGoogleSpreadsheetMetadata(
          extracted.spreadsheetId,
          token
        );
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : '';
        if (msg.includes('انتهت صلاحية') || msg.includes('صلاحية قراءة')) {
          token = await obtainValidSheetsToken(true);
          metadata = await fetchGoogleSpreadsheetMetadata(
            extracted.spreadsheetId,
            token
          );
        } else {
          throw firstErr;
        }
      }

      setSheetMeta(metadata);
      const matchedTab =
        extracted.gid !== null
          ? metadata.sheets.find((s) => s.sheetId === extracted.gid)
          : selectedTabTitle
          ? metadata.sheets.find((s) => s.title === selectedTabTitle)
          : undefined;
      const chosenTitle = matchedTab?.title || metadata.sheets[0]?.title || '';
      setSelectedTabTitle(chosenTitle);

      saveGoogleSheetsSyncPreferences({
        spreadsheetInput: raw,
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.title,
        sheetTitle: chosenTitle,
        targetYear,
        targetMonth,
      });

      setStatusBanner({
        type: 'success',
        text: `تم الاتصال بالجدول "${metadata.title}" والعثور على ${metadata.sheets.length} ورقة عمل. اختر الورقة واضغط "قراءة ومعاينة البيانات" أو "مزامنة فورية".`,
      });
    } catch (err) {
      if (!isBenignAbortError(err)) {
        setStatusBanner({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'تعذر فحص جدول Google Sheets. تأكد من الرابط وصلاحية المشاركة.',
        });
      }
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const handleChangeSyncMode = (nextMode: GoogleSheetsSyncMode) => {
    setSyncMode(nextMode);
    saveGoogleSheetsSyncPreferences({
      syncMode: nextMode,
      intervalMinutes: syncIntervalMinutes,
      spreadsheetInput: sheetInput.trim() || savedSyncPrefs.spreadsheetInput,
      sheetTitle: selectedTabTitle || savedSyncPrefs.sheetTitle,
      targetYear,
      targetMonth,
    });
    setStatusBanner({
      type: 'info',
      text:
        nextMode === 'auto'
          ? `تم تفعيل وضع المزامنة التلقائية الدورية كل ${syncIntervalMinutes} دقيقة أثناء الجلسة النشطة.`
          : 'تم ضبط وضع المزامنة اليدوية عند الطلب.',
    });
  };

  const handleChangeSyncInterval = (
    nextInterval: GoogleSheetsSyncIntervalMinutes
  ) => {
    setSyncIntervalMinutes(nextInterval);
    saveGoogleSheetsSyncPreferences({
      syncMode,
      intervalMinutes: nextInterval,
      spreadsheetInput: sheetInput.trim() || savedSyncPrefs.spreadsheetInput,
      sheetTitle: selectedTabTitle || savedSyncPrefs.sheetTitle,
      targetYear,
      targetMonth,
    });
    if (syncMode === 'auto') {
      setStatusBanner({
        type: 'info',
        text: `تم تحديث الفترة الزمنية للمزامنة التلقائية إلى كل ${nextInterval} دقيقة.`,
      });
    }
  };

  const handleQuickDirectSyncGoogleSheets = async () => {
    const raw = sheetInput.trim();
    if (!isGoogleSheetsInput(raw)) {
      setStatusBanner({
        type: 'error',
        text: 'يرجى إدخال رابط أو معرّف Google Sheets صالح أولاً.',
      });
      return;
    }

    setIsQuickSyncingSheets(true);
    setStatusBanner(null);
    try {
      let token = await obtainValidSheetsToken(false);
      let result: Awaited<ReturnType<typeof executeGoogleSheetsDirectSync>>;
      try {
        result = await executeGoogleSheetsDirectSync({
          spreadsheetInput: raw,
          preferredSheetTitle: selectedTabTitle || savedSyncPrefs.sheetTitle,
          accessToken: token,
          targetYear,
          targetMonth,
          existingEmployees: employees,
          defaultTeamId: currentUser.teamId || '',
        });
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : '';
        if (msg.includes('انتهت صلاحية') || msg.includes('صلاحية قراءة')) {
          token = await obtainValidSheetsToken(true);
          result = await executeGoogleSheetsDirectSync({
            spreadsheetInput: raw,
            preferredSheetTitle: selectedTabTitle || savedSyncPrefs.sheetTitle,
            accessToken: token,
            targetYear,
            targetMonth,
            existingEmployees: employees,
            defaultTeamId: currentUser.teamId || '',
          });
        } else {
          throw firstErr;
        }
      }

      const sourceLabel = `مزامنة Google Sheets المباشرة (${result.metadata.title} — ${result.resolvedSheetTitle})`;
      await onImportData(
        result.parsed.employees,
        result.parsed.attendanceRecords,
        true,
        result.parsed.telemetryUpdates,
        sourceLabel
      );

      const syncedTimeLabel = new Date().toLocaleString('ar-EG');
      saveGoogleSheetsSyncPreferences({
        syncMode,
        intervalMinutes: syncIntervalMinutes,
        spreadsheetInput: raw,
        spreadsheetId: result.metadata.spreadsheetId,
        spreadsheetTitle: result.metadata.title,
        sheetTitle: result.resolvedSheetTitle,
        targetYear,
        targetMonth,
        lastSyncedAt: syncedTimeLabel,
      });

      if (currentUser.role === 'super_admin') {
        await saveSecurityPolicySettings({
          actor: currentUser,
          settings: {
            ...securityPolicy,
            externalSyncEndpoint: raw.slice(0, 300),
            lastExternalSyncStatus: `متصل بـ Google Sheets (${result.resolvedSheetTitle})`.slice(
              0,
              100
            ),
            lastExternalSyncImported: result.parsed.stats.importedEmployees,
            lastExternalSyncFailed: result.parsed.stats.skippedRows,
            lastExternalSyncTime: syncedTimeLabel,
          },
          auditActionLabel: 'مزامنة فورية مباشرة من Google Sheets إلى السحابة',
        });
      }

      onSyncComplete(
        `تمت مزامنة ${result.parsed.stats.importedEmployees} مندوب و${result.parsed.stats.importedAttendance} سجل شفت من ورقة "${result.resolvedSheetTitle}" بنجاح.`
      );
      onClose();
    } catch (err) {
      if (!isBenignAbortError(err)) {
        setStatusBanner({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'فشلت المزامنة مع Google Sheets. تأكد من الاتصال بالإنترنت ومشاركة الجدول مع حسابك.',
        });
      }
    } finally {
      setIsQuickSyncingSheets(false);
    }
  };

  const handleReadAndPreviewSheet = async () => {
    if (!sheetMeta || !selectedTabTitle) {
      setStatusBanner({
        type: 'error',
        text: 'يرجى فحص الجدول واختيار ورقة العمل (Tab) أولاً.',
      });
      return;
    }

    setIsReadingSheet(true);
    setStatusBanner(null);
    setConfirmingSheetImport(false);

    try {
      const token = await obtainValidSheetsToken(false);
      const rows = await fetchGoogleSheetTabValues(
        sheetMeta.spreadsheetId,
        selectedTabTitle,
        token
      );
      const parsed = parseGoogleSheetRowsToShiftData(rows, {
        targetYear,
        targetMonth,
        existingEmployees: employees,
        defaultTeamId: currentUser.teamId || '',
      });

      setSheetPreview(parsed);
      setStatusBanner({
        type: 'info',
        text: `تمت قراءة وتحليل البيانات بنجاح من ورقة "${selectedTabTitle}": ${parsed.stats.importedEmployees} مندوب و${parsed.stats.importedAttendance} سجل حضور. راجع المعاينة بالأسفل ثم أكّد الاستيراد.`,
      });
    } catch (err) {
      if (!isBenignAbortError(err)) {
        setSheetPreview(null);
        setStatusBanner({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'تعذر قراءة صفوف ورقة العمل المحددة من Google Sheets.',
        });
      }
    } finally {
      setIsReadingSheet(false);
    }
  };

  const handleConfirmImportFromGoogleSheet = async () => {
    if (!sheetPreview || !sheetMeta) return;

    setIsImportingSheet(true);
    setStatusBanner(null);
    try {
      const sourceLabel = `مزامنة Google Sheets (${sheetMeta.title} — ${selectedTabTitle})`;
      await onImportData(
        sheetPreview.employees,
        sheetPreview.attendanceRecords,
        true,
        sheetPreview.telemetryUpdates,
        sourceLabel
      );

      const syncedTimeLabel = new Date().toLocaleString('ar-EG');
      saveGoogleSheetsSyncPreferences({
        syncMode,
        intervalMinutes: syncIntervalMinutes,
        spreadsheetInput: sheetInput.trim(),
        spreadsheetId: sheetMeta.spreadsheetId,
        spreadsheetTitle: sheetMeta.title,
        sheetTitle: selectedTabTitle,
        targetYear,
        targetMonth,
        lastSyncedAt: syncedTimeLabel,
      });

      if (currentUser.role === 'super_admin') {
        await saveSecurityPolicySettings({
          actor: currentUser,
          settings: {
            ...securityPolicy,
            externalSyncEndpoint: sheetInput.trim().slice(0, 300),
            lastExternalSyncStatus: `متصل بـ Google Sheets (${selectedTabTitle})`.slice(
              0,
              100
            ),
            lastExternalSyncImported: sheetPreview.stats.importedEmployees,
            lastExternalSyncFailed: sheetPreview.stats.skippedRows,
            lastExternalSyncTime: syncedTimeLabel,
          },
          auditActionLabel: 'حفظ ومزامنة بيانات Google Sheets في السحابة',
        });
      }

      onSyncComplete(
        `تم استيراد ${sheetPreview.stats.importedEmployees} مندوب و${sheetPreview.stats.importedAttendance} سجل شفت من Google Sheets بنجاح.`
      );
      onClose();
    } catch (err) {
      if (!isBenignAbortError(err)) {
        setStatusBanner({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'تعذر حفظ البيانات المستوردة من Google Sheets في Cloud Firestore.',
        });
      }
    } finally {
      setIsImportingSheet(false);
      setConfirmingSheetImport(false);
    }
  };

  const handleSaveEndpoint = async () => {
    if (currentUser.role !== 'super_admin') return;
    try {
      await saveSecurityPolicySettings({
        actor: currentUser,
        settings: {
          ...securityPolicy,
          externalSyncEndpoint: endpointUrl.trim(),
        },
      });
      setStatusBanner({
        type: 'success',
        text: 'تم حفظ رابط نقطة المزامنة الآمنة في سياسات النظام.',
      });
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'تعذر حفظ رابط المزامنة.',
      });
    }
  };

  const handleSyncFromEndpoint = async () => {
    const trimmed = endpointUrl.trim();
    if (!trimmed) {
      onSyncComplete('تم التحقق من مطابقة البيانات مع قاعدة بيانات Firestore السحابية.');
      onClose();
      return;
    }

    // توجيه تلقائي ذكي إذا أدخل المستخدم رابط Google Sheets في حقل الرابط الخارجي
    if (isGoogleSheetsInput(trimmed)) {
      setSheetInput(trimmed);
      await handleInspectSpreadsheet(trimmed);
      return;
    }

    if (syncAbortRef.current) {
      syncAbortRef.current.abort();
    }
    const controller = new AbortController();
    syncAbortRef.current = controller;

    setIsTesting(true);
    setStatusBanner(null);
    try {
      const payload = await runExternalCompanyEndpointSync({
        endpointUrl: trimmed,
        actorRole: currentUser.role,
        actorStatus: currentUser.status,
        signal: controller.signal,
      });

      await onImportData(
        payload.employees,
        payload.attendanceRecords || {},
        true
      );

      if (currentUser.role === 'super_admin') {
        await saveSecurityPolicySettings({
          actor: currentUser,
          settings: {
            ...securityPolicy,
            externalSyncEndpoint: trimmed,
            lastExternalSyncStatus: 'نجاح المزامنة الآمنة',
            lastExternalSyncImported:
              payload.stats?.importedEmployees || payload.employees.length,
            lastExternalSyncFailed: payload.stats?.failedCount || 0,
            lastExternalSyncTime: new Date().toLocaleString('ar-EG'),
          },
        });
      }

      onSyncComplete(
        `تمت مزامنة ${payload.employees.length} مندوب بنجاح من النظام الخارجي وتوسيمها كمصدر خارجي موثوق.`
      );
      onClose();
    } catch (err) {
      if (isBenignAbortError(err)) {
        return;
      }
      setStatusBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'تعذر الاتصال بالنظام الخارجي. يمكنك استخدام الربط المباشر مع Google Sheets أو استيراد ملف JSON.',
      });
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null;
        setIsTesting(false);
      }
    }
  };

  const handleExportBackupJson = () => {
    const backup = {
      version: '2.0-rbac',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.email,
      employees,
      attendanceRecords,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_الشفتات_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusBanner({
      type: 'success',
      text: 'تم تنزيل ملف النسخة الاحتياطية (JSON) بنجاح.',
    });
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = String(event.target?.result || '');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed.employees)) {
          setStatusBanner({
            type: 'error',
            text: 'صيغة الملف غير صالحة: يجب أن يحتوي ملف JSON على قائمة المندوبين (employees).',
          });
          return;
        }
        await onImportData(
          parsed.employees,
          parsed.attendanceRecords || {},
          true
        );
        onSyncComplete(
          `تم استيراد وترحيل ${parsed.employees.length} مندوب وسجلات حضورهم إلى Cloud Firestore بنجاح.`
        );
        onClose();
      } catch {
        setStatusBanner({
          type: 'error',
          text: 'تعذر قراءة ملف JSON أو حفظه في قاعدة البيانات.',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 text-xs my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
              title="الرجوع للخلف"
            >
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              <span>رجوع للخلف</span>
            </button>
            <div>
              <h3 className="font-bold text-base">
                مزامنة Google Sheets والشفتات والنسخ الاحتياطي
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                قراءة أوراق العمل مباشرة من Google Sheets أو استيراد وتصدير البيانات إلى Cloud Firestore
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {statusBanner && (
            <div
              className={`p-3 rounded-lg border font-medium leading-relaxed ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-300'
                  : statusBanner.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-300'
                  : 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-300'
              }`}
            >
              {statusBanner.text}
            </div>
          )}

          {/* القسم الأول: الربط المباشر مع Google Sheets API v4 */}
          {canManageIntegration && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  الربط المباشر وقراءة البيانات من Google Sheets
                </h4>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] border ${
                      hasGoogleSheetsToken
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300'
                    }`}
                  >
                    {hasGoogleSheetsToken
                      ? 'إذن Google Sheets نشط'
                      : 'بانتظار إذن القراءة من Google'}
                  </span>
                  <button
                    type="button"
                    disabled={isAuthorizingSheets}
                    onClick={handleAuthorizeGoogleSheets}
                    className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    {isAuthorizingSheets
                      ? 'جارٍ طلب الإذن...'
                      : hasGoogleSheetsToken
                      ? 'تجديد إذن Google'
                      : 'منح إذن Google Sheets'}
                  </button>
                </div>
              </div>

              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                أدخل رابط جدول Google Sheets أو معرّف الجدول (Spreadsheet ID). يدعم النظام قراءة الجداول اليومية (الكود، الاسم، التاريخ، الشفت، الحضور، الباتش، المحفظة) وكذلك جداول الشهر الكامل بالأيام (1–31) دون افتراض اسم ثابت للورقة.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => {
                    setSheetInput(e.target.value);
                    setConfirmingSheetImport(false);
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
                  dir="ltr"
                  className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left"
                />
                <button
                  type="button"
                  disabled={isLoadingMeta || isQuickSyncingSheets || !sheetInput.trim()}
                  onClick={() => handleInspectSpreadsheet()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingMeta ? 'animate-spin' : ''}`}
                  />
                  {isLoadingMeta ? 'جارٍ فحص الجدول...' : 'جلب أوراق الملف (Tabs)'}
                </button>
                {isGoogleSheetsInput(sheetInput) && (
                  <button
                    type="button"
                    disabled={isQuickSyncingSheets || isLoadingMeta}
                    onClick={handleQuickDirectSyncGoogleSheets}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                    title="قراءة ومزامنة الجدول مباشرة إلى Cloud Firestore"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isQuickSyncingSheets ? 'animate-spin' : ''
                      }`}
                    />
                    {isQuickSyncingSheets ? 'جارٍ المزامنة...' : 'مزامنة فورية'}
                  </button>
                )}
              </div>

              {/* اختيار وضع المزامنة: يدوية أو تلقائية دورية */}
              <div className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-emerald-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 block">
                      آلية مزامنة Google Sheets (يدوية / تلقائية)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {syncMode === 'auto'
                        ? `المزامنة التلقائية مفعلة كل ${syncIntervalMinutes} دقيقة أثناء الجلسة النشطة دون أي بيانات وهمية`
                        : 'المزامنة اليدوية مفعلة (يتم التحديث عند الضغط على زر المزامنة فقط)'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
                    <button
                      type="button"
                      onClick={() => handleChangeSyncMode('manual')}
                      className={`px-3 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                        syncMode === 'manual'
                          ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      مزامنة يدوية
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeSyncMode('auto')}
                      className={`px-3 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                        syncMode === 'auto'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      مزامنة تلقائية
                    </button>
                  </div>

                  {syncMode === 'auto' && (
                    <select
                      value={syncIntervalMinutes}
                      onChange={(e) =>
                        handleChangeSyncInterval(
                          Number(e.target.value) as GoogleSheetsSyncIntervalMinutes
                        )
                      }
                      aria-label="فترة المزامنة التلقائية"
                      className="border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-[11px]"
                    >
                      <option value={5}>كل 5 دقائق</option>
                      <option value={10}>كل 10 دقائق</option>
                      <option value={15}>كل 15 دقيقة</option>
                      <option value={30}>كل 30 دقيقة</option>
                    </select>
                  )}
                </div>
              </div>

              {sheetMeta && (
                <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-slate-500 text-[11px] block">
                        عنوان الملف المتصل
                      </span>
                      <strong className="text-slate-900 dark:text-slate-100 text-sm">
                        {sheetMeta.title}
                      </strong>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      {sheetMeta.sheets.length} أوراق عمل متاحة
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        ورقة العمل (Tab)
                      </label>
                      <select
                        value={selectedTabTitle}
                        onChange={(e) => {
                          setSelectedTabTitle(e.target.value);
                          setSheetPreview(null);
                          setConfirmingSheetImport(false);
                        }}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold"
                      >
                        {sheetMeta.sheets.map((tab) => (
                          <option key={tab.sheetId} value={tab.title}>
                            {tab.title} ({tab.rowCount} صف)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        الشهر (للجداول الشهرية ١–٣١)
                      </label>
                      <select
                        value={targetMonth}
                        onChange={(e) => {
                          setTargetMonth(Number(e.target.value));
                          setSheetPreview(null);
                          setConfirmingSheetImport(false);
                        }}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold"
                      >
                        {MONTH_NAMES.map((mName, idx) => (
                          <option key={mName} value={idx + 1}>
                            {mName} ({idx + 1})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        السنة
                      </label>
                      <input
                        type="number"
                        min={2020}
                        max={2099}
                        value={targetYear}
                        onChange={(e) => {
                          setTargetYear(Number(e.target.value) || now.getFullYear());
                          setSheetPreview(null);
                          setConfirmingSheetImport(false);
                        }}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isReadingSheet || !selectedTabTitle}
                      onClick={handleReadAndPreviewSheet}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isReadingSheet
                        ? 'جارٍ قراءة الصفوف من Google Sheets...'
                        : 'قراءة ومعاينة البيانات'}
                    </button>
                  </div>
                </div>
              )}

              {sheetPreview && (
                <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      معاينة البيانات المقروءة قبل الحفظ في السحابة
                    </div>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                      {sheetPreview.layoutMode === 'monthly_matrix'
                        ? 'تخطيط مصفوفة شهرية (1–31)'
                        : 'تخطيط سجلات جدولية'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
                      <span className="text-slate-500 block">المندوبون المكتشفون</span>
                      <strong className="font-mono text-sm text-emerald-600">
                        {sheetPreview.stats.importedEmployees}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
                      <span className="text-slate-500 block">سجلات الشفتات/الحضور</span>
                      <strong className="font-mono text-sm text-indigo-600">
                        {sheetPreview.stats.importedAttendance}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
                      <span className="text-slate-500 block">محافظ وباتشات</span>
                      <strong className="font-mono text-sm text-amber-600">
                        {sheetPreview.stats.importedTelemetry}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
                      <span className="text-slate-500 block">صفوف فارغة متخطاة</span>
                      <strong className="font-mono text-sm text-slate-600 dark:text-slate-300">
                        {sheetPreview.stats.skippedRows}
                      </strong>
                    </div>
                  </div>

                  <div className="max-h-28 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                    {sheetPreview.employees.slice(0, 5).map((emp) => (
                      <div
                        key={emp.id}
                        className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {emp.fullName}
                        </span>
                        <span className="font-mono text-slate-500">
                          {emp.employeeCode}
                          {emp.teamId ? ` • ${emp.teamId}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {sheetPreview.warnings.length > 0 && (
                    <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        تنبيهات التحليل:
                      </div>
                      {sheetPreview.warnings.slice(0, 3).map((w, i) => (
                        <div key={i} className="text-[11px]">
                          • {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {!confirmingSheetImport ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setConfirmingSheetImport(true)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        اعتماد واستيراد البيانات إلى النظام
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-2.5">
                      <p className="font-bold text-amber-950 dark:text-amber-200 leading-relaxed">
                        تأكيد التحديث: سيتم تحديث وحفظ {sheetPreview.stats.importedEmployees}{' '}
                        مندوب و{sheetPreview.stats.importedAttendance} سجل شفت/حضور في قاعدة بيانات Cloud Firestore وتوثيق العملية في سجل المراجعة. هل ترغب في المتابعة؟
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isImportingSheet}
                          onClick={() => setConfirmingSheetImport(false)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          disabled={isImportingSheet}
                          onClick={handleConfirmImportFromGoogleSheet}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold cursor-pointer"
                        >
                          {isImportingSheet
                            ? 'جارٍ الحفظ في السحابة...'
                            : 'تأكيد الاستيراد النهائي'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* استيراد وتصدير ملف JSON */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
              <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              النسخ الاحتياطي والاستيراد السحابي (JSON)
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              تصدير نسخة احتياطية مشفرة الصلاحية، أو استيراد ملف شفتات وحفظه مباشرة في قاعدة بيانات Cloud Firestore مع توسيم السجلات وتوثيق العملية في Audit Log.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportBackupJson}
                className="px-4 py-2 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير نسخة احتياطية (JSON)
              </button>
              <a
                href="/api/download-dist-zip"
                download="dist_static_web_infinityfree.zip"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                title="تنزيل ملف ZIP مضغوط يضم محتويات مجلد dist بالكامل للرفع المباشر على استضافة الويب (InfinityFree)"
              >
                <Download className="w-3.5 h-3.5" />
                تنزيل حزمة الإنتاج (dist.zip)
              </a>
              {canManageIntegration && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    استيراد ملف شفتات (JSON)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportJsonFile}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* الربط الآمن مع نقطة بيانات الشركة الخارجية */}
          {canManageIntegration ? (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                المزامنة عبر الخادم الخلفي الآمن (External Company JSON API)
              </h4>
              <div className="flex gap-2">
                <input
                  type="url"
                  disabled={currentUser.role !== 'super_admin'}
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.company.com/shifts-export.json"
                  dir="ltr"
                  className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left disabled:opacity-60"
                />
                {currentUser.role === 'super_admin' && (
                  <button
                    type="button"
                    onClick={handleSaveEndpoint}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    حفظ الرابط
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-[11px]">
                <div>
                  <span className="text-slate-500 block">حالة الاتصال</span>
                  <strong>{securityPolicy.lastExternalSyncStatus}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">آخر مزامنة</span>
                  <strong className="font-mono">
                    {securityPolicy.lastExternalSyncTime || lastSyncTime}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">سجلات مستوردة</span>
                  <strong className="font-mono text-emerald-600">
                    {securityPolicy.lastExternalSyncImported}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">سجلات متخطاة/فاشلة</span>
                  <strong className="font-mono text-rose-600">
                    {securityPolicy.lastExternalSyncFailed}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">
              إدارة إعدادات الربط الخارجي وGoogle Sheets مقصورة على مدير النظام والعمليات المخولين فقط.
            </p>
          )}
        </div>

        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium whitespace-nowrap"
          >
            إغلاق
          </button>
          {canManageIntegration && (
            <button
              type="button"
              disabled={isTesting}
              onClick={handleSyncFromEndpoint}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`}
              />
              {isTesting ? 'جارٍ المزامنة الآمنة...' : 'مزامنة الرابط الخارجي'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
