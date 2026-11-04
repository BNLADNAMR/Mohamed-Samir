import {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  RepBatchId,
  ShiftSelectionStatus,
} from '../types';
import { calculateShiftMinutes } from '../utils/shiftCalculations';

/**
 * النطاق الأدنى المطلوب لقراءة جداول Google Sheets وفق مبدأ الصلاحيات الأقل (Least Privilege)
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
] as const;

export interface GoogleSheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface GoogleSpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: GoogleSheetTabInfo[];
}

export interface SheetTelemetryImportItem {
  employeeId: string;
  batch: RepBatchId;
  walletBalance: number;
  isOnline?: boolean;
}

export interface ParsedGoogleSheetShiftData {
  layoutMode: 'transactional_rows' | 'monthly_matrix';
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  telemetryUpdates: SheetTelemetryImportItem[];
  stats: {
    totalRowsRead: number;
    importedEmployees: number;
    importedAttendance: number;
    importedTelemetry: number;
    skippedRows: number;
  };
  warnings: string[];
}

const SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9_-]{15,120}$/;

/**
 * تحويل الأرقام العربية الشرقية والفارسية إلى أرقام قياسية وتنظيف المسافات الخفية
 */
export function normalizeDigitsAndTrim(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
}

/**
 * استخراج معرّف جدول Google Sheets ورقم الورقة الفرعية (gid) من رابط كامل أو معرّف مباشر
 */
export function extractSpreadsheetIdAndGid(input: string): {
  spreadsheetId: string;
  gid: number | null;
} | null {
  const cleaned = normalizeDigitsAndTrim(input);
  if (!cleaned) return null;

  // حالة إدخال المعرّف المباشر فقط بدون رابط
  if (
    !cleaned.includes('/') &&
    !cleaned.includes(':') &&
    !cleaned.includes('.') &&
    SPREADSHEET_ID_REGEX.test(cleaned)
  ) {
    return { spreadsheetId: cleaned, gid: null };
  }

  try {
    const parsedUrl = new URL(cleaned);
    const host = parsedUrl.hostname.toLowerCase();
    if (
      host !== 'docs.google.com' &&
      host !== 'sheets.googleapis.com' &&
      host !== 'drive.google.com'
    ) {
      return null;
    }

    const match =
      parsedUrl.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,120})/) ||
      parsedUrl.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{15,120})/);

    const idFromQuery = parsedUrl.searchParams.get('id');
    const spreadsheetId = match?.[1] || idFromQuery || '';

    if (!SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
      return null;
    }

    let gid: number | null = null;
    const queryGid = parsedUrl.searchParams.get('gid');
    const hashGidMatch = parsedUrl.hash.match(/gid=(\d+)/);
    const rawGid = queryGid || hashGidMatch?.[1] || null;
    if (rawGid !== null && /^\d+$/.test(rawGid)) {
      gid = Number(rawGid);
    }

    return { spreadsheetId, gid };
  } catch {
    return null;
  }
}

export function isGoogleSheetsInput(input: string): boolean {
  return extractSpreadsheetIdAndGid(input) !== null;
}

/**
 * تأمين اسم التبويب عند بناء نطاق A1 في Google Sheets API دون افتراض اسم ثابت مثل Sheet1
 */
export function formatSheetTabRange(sheetTitle: string, cellRange?: string): string {
  const cleanTitle = sheetTitle.trim();
  const escaped = `'${cleanTitle.replace(/'/g, "''")}'`;
  return cellRange ? `${escaped}!${cellRange}` : escaped;
}

function mapGoogleSheetsHttpErrorAr(status: number, apiMessage?: string): string {
  if (status === 401) {
    return 'انتهت صلاحية جلسة الوصول إلى Google Sheets أو لم يتم منح الإذن بعد. اضغط على زر "تفعيل إذن Google Sheets" وأعد المحاولة.';
  }
  if (status === 403) {
    return 'لا يملك حساب Google الحالي صلاحية قراءة هذا الملف في Google Sheets، أو لم يتم منح إذن قراءة الجداول أثناء تسجيل الدخول. تأكد من مشاركة الشيت مع حسابك.';
  }
  if (status === 404) {
    return 'لم يتم العثور على جدول Google Sheets بهذا الرابط أو المعرّف. تحقق من صحة الرابط.';
  }
  if (status === 429) {
    return 'تم تجاوز الحد المؤقت لطلبات Google Sheets API. انتظر لحظات ثم حاول مجدداً.';
  }
  return apiMessage
    ? `تعذر الاتصال بـ Google Sheets API (${status}): ${apiMessage}`
    : `تعذر قراءة البيانات من Google Sheets (رمز الحالة ${status}).`;
}

/**
 * جلب بيانات الجدول وقائمة التبويبات الفعلية مباشرة من Google Sheets API v4
 */
export async function fetchGoogleSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<GoogleSpreadsheetMetadata> {
  if (!SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
    throw new Error('معرّف جدول Google Sheets غير صالح.');
  }
  if (!accessToken) {
    throw new Error('يلزم منح إذن الوصول إلى Google Sheets أولاً لقراءة أوراق العمل.');
  }

  const fields =
    'spreadsheetId,properties.title,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=${encodeURIComponent(fields)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    signal,
  });

  const body = (await res.json().catch(() => ({}))) as {
    spreadsheetId?: string;
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        index?: number;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(mapGoogleSheetsHttpErrorAr(res.status, body.error?.message));
  }

  const sheets: GoogleSheetTabInfo[] = (body.sheets || [])
    .map((s, idx) => ({
      sheetId: Number(s.properties?.sheetId ?? idx),
      title: String(s.properties?.title || `Sheet${idx + 1}`),
      index: Number(s.properties?.index ?? idx),
      rowCount: Number(s.properties?.gridProperties?.rowCount ?? 0),
      columnCount: Number(s.properties?.gridProperties?.columnCount ?? 0),
    }))
    .sort((a, b) => a.index - b.index);

  if (sheets.length === 0) {
    throw new Error('لا يحتوي ملف Google Sheets المحدد على أي أوراق عمل قابلة للقراءة.');
  }

  return {
    spreadsheetId: String(body.spreadsheetId || spreadsheetId),
    title: String(body.properties?.title || 'جدول شفتات Google Sheets'),
    sheets,
  };
}

/**
 * قراءة صفوف ورقة عمل محددة من Google Sheets API v4
 */
export async function fetchGoogleSheetTabValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<string[][]> {
  if (!SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
    throw new Error('معرّف جدول Google Sheets غير صالح.');
  }
  if (!sheetTitle.trim()) {
    throw new Error('يرجى اختيار ورقة العمل (Tab) المراد قراءتها.');
  }
  if (!accessToken) {
    throw new Error('يلزم منح إذن الوصول إلى Google Sheets أولاً.');
  }

  const range = formatSheetTabRange(sheetTitle);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    signal,
  });

  const body = (await res.json().catch(() => ({}))) as {
    values?: unknown[][];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(mapGoogleSheetsHttpErrorAr(res.status, body.error?.message));
  }

  const rawValues = Array.isArray(body.values) ? body.values : [];
  return rawValues.map((row) =>
    Array.isArray(row) ? row.map((cell) => normalizeDigitsAndTrim(cell)) : []
  );
}

function normalizeHeaderKey(header: string): string {
  return normalizeDigitsAndTrim(header)
    .toLowerCase()
    .replace(/[_\-\s/\\()[\]{}:.،]+/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function sanitizeDocId(raw: string): string {
  return normalizeDigitsAndTrim(raw)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

function normalizeDateCell(
  raw: string,
  fallbackYear: number,
  fallbackMonth: number
): string | null {
  const clean = normalizeDigitsAndTrim(raw);
  if (!clean) return null;

  // YYYY-MM-DD or YYYY/M/D
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY or D-M-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    const m = first > 12 ? second : second > 12 ? first : second;
    const d = first > 12 ? first : second > 12 ? second : first;
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Day number only (1..31) in monthly matrix headers
  if (/^\d{1,2}$/.test(clean)) {
    const day = Number(clean);
    if (day >= 1 && day <= 31) {
      return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`;
    }
  }

  // Day/Month without year (e.g. 15/11 or 11-15)
  const dmShort = clean.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (dmShort) {
    const a = Number(dmShort[1]);
    const b = Number(dmShort[2]);
    if (b === fallbackMonth && a >= 1 && a <= 31) {
      return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(
        a
      ).padStart(2, '0')}`;
    }
    if (a === fallbackMonth && b >= 1 && b <= 31) {
      return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(
        b
      ).padStart(2, '0')}`;
    }
  }

  return null;
}

function normalizeTimeCell(raw: string, fallback: string): string {
  const clean = normalizeDigitsAndTrim(raw);
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseShiftSelectionValue(
  raw: string,
  inferredAttendance?: AttendanceStatus
): ShiftSelectionStatus {
  const v = normalizeHeaderKey(raw);
  if (
    v === 'selected' ||
    v === 'نعم' ||
    v === 'مختار' ||
    v === 'محدد' ||
    v === 'حجز' ||
    v === 'اختار' ||
    v === 'true' ||
    v === 'yes' ||
    v === '1'
  ) {
    return 'selected';
  }
  if (
    v === 'notselected' ||
    v === 'لا' ||
    v === 'لميحجز' ||
    v === 'لميختر' ||
    v === 'غيرمختار' ||
    v === 'غيرمحدد' ||
    v === 'false' ||
    v === 'no' ||
    v === '0'
  ) {
    return 'not_selected';
  }
  if (v === 'exempt' || v === 'معفي' || v === 'اعفاء' || v === 'اجازه' || v === 'راحه') {
    return 'exempt';
  }
  if (inferredAttendance === 'leave' || inferredAttendance === 'day_off') {
    return 'exempt';
  }
  if (inferredAttendance === 'worked' || inferredAttendance === 'absent') {
    return 'selected';
  }
  return 'undecided';
}

function parseAttendanceCellValue(raw: string): {
  attendance: AttendanceStatus;
  shiftSelection: ShiftSelectionStatus;
  startTime: string;
  endTime: string;
} | null {
  const clean = normalizeDigitsAndTrim(raw);
  if (!clean || clean === '-' || clean === '—') return null;

  // دعم صيغة وقت مباشر داخل الخلية مثل 09:00-17:00
  const rangeMatch = clean.match(/(\d{1,2}:\d{2})\s*[-–—toإلى]+\s*(\d{1,2}:\d{2})/i);
  if (rangeMatch) {
    return {
      attendance: 'worked',
      shiftSelection: 'selected',
      startTime: normalizeTimeCell(rangeMatch[1], '09:00'),
      endTime: normalizeTimeCell(rangeMatch[2], '17:00'),
    };
  }

  const v = normalizeHeaderKey(clean);
  if (
    v === 'worked' ||
    v === 'حضر' ||
    v === 'حاضر' ||
    v === 'مباشر' ||
    v === 'داوم' ||
    v === 'عمليومكامل' ||
    v === 'present' ||
    v === 'p' ||
    v === 'w' ||
    v === '✓' ||
    v === '✔' ||
    v === '1'
  ) {
    return {
      attendance: 'worked',
      shiftSelection: 'selected',
      startTime: '09:00',
      endTime: '17:00',
    };
  }

  if (
    v === 'absent' ||
    v === 'غائب' ||
    v === 'غياب' ||
    v === 'غايب' ||
    v === 'a' ||
    v === 'x' ||
    v === '✗' ||
    v === '0'
  ) {
    return {
      attendance: 'absent',
      shiftSelection: 'selected',
      startTime: '09:00',
      endTime: '17:00',
    };
  }

  if (
    v === 'leave' ||
    v === 'اجازه' ||
    v === 'إجازه' ||
    v === 'اذن' ||
    v === 'مرضي' ||
    v === 'سنوي' ||
    v === 'l'
  ) {
    return {
      attendance: 'leave',
      shiftSelection: 'exempt',
      startTime: '09:00',
      endTime: '17:00',
    };
  }

  if (
    v === 'dayoff' ||
    v === 'off' ||
    v === 'راحه' ||
    v === 'عطله' ||
    v === 'يومراحه' ||
    v === 'اجازهاسبوعيه' ||
    v === 'o'
  ) {
    return {
      attendance: 'day_off',
      shiftSelection: 'exempt',
      startTime: '09:00',
      endTime: '17:00',
    };
  }

  if (
    v === 'notselected' ||
    v === 'لميحجز' ||
    v === 'لميختر' ||
    v === 'غيرمحدد'
  ) {
    return {
      attendance: 'pending',
      shiftSelection: 'not_selected',
      startTime: '09:00',
      endTime: '17:00',
    };
  }

  if (v === 'pending' || v === 'قيدالانتظار' || v === 'مجدول' || v === 'انتظار') {
    return {
      attendance: 'pending',
      shiftSelection: 'selected',
      startTime: '09:00',
      endTime: '17:00',
    };
  }

  return null;
}

function parseRepBatch(raw: string): RepBatchId | null {
  const clean = normalizeDigitsAndTrim(raw);
  if (!clean) return null;
  const digitMatch = clean.match(/[1-6]/);
  if (digitMatch) {
    return `Batch ${digitMatch[0]}` as RepBatchId;
  }
  return null;
}

function parseWalletNumber(raw: string): number | null {
  const normalized = normalizeDigitsAndTrim(raw).replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(10_000_000, Number(num.toFixed(2))));
}

const HEADER_ALIASES: Record<string, string[]> = {
  code: [
    'employeecode',
    'code',
    'id',
    'empid',
    'repid',
    'repcode',
    'riderid',
    'كود',
    'كودالمندوب',
    'رقمالمندوب',
    'الرقمالوظيفي',
    'معرفالمندوب',
    'الكود',
  ],
  name: [
    'fullname',
    'name',
    'employeename',
    'repname',
    'ridername',
    'الاسم',
    'اسمالمندوب',
    'الاسمالكامل',
    'المندوب',
    'اسمالكابتن',
  ],
  phone: ['phone', 'mobile', 'phonenumber', 'tel', 'الهاتف', 'الجوال', 'الموبايل', 'رقمالجوال', 'رقمالهاتف'],
  hireDate: ['hiredate', 'joindate', 'startdate', 'تاريخالتعيين', 'تاريخالالتحاق', 'تاريخالمباشره'],
  empStatus: ['employeestatus', 'accountstatus', 'حالهالمندوب', 'الحالهالوظيفيه'],
  teamId: ['teamid', 'team', 'teamcode', 'الفريق', 'كودالفريق', 'المجموعه'],
  notes: ['notes', 'note', 'supervisornotes', 'comment', 'ملاحظات', 'ملاحظاتالمشرف', 'ملاحظه'],
  date: ['date', 'daydate', 'shiftdate', 'التاريخ', 'تاريخالشفت', 'تاريخاليوم'],
  shiftSelection: ['shiftselection', 'shift', 'selection', 'اختيارالشفت', 'حجزالشفت', 'الشفت', 'حالهالشفت'],
  attendance: ['attendance', 'attendancestatus', 'status', 'الحضور', 'حالهالحضور', 'الدوام', 'الحاله'],
  startTime: ['starttime', 'checkin', 'from', 'start', 'وقتالبدايه', 'وقتالحضور', 'من', 'بدايهالشفت'],
  endTime: ['endtime', 'checkout', 'to', 'end', 'وقتالانصراف', 'وقتالنهايه', 'الي', 'نهايهالشفت'],
  breakMinutes: ['breakminutes', 'break', 'استراحه', 'الاستراحه', 'دقائقاستراحه', 'دقائقالاستراحه'],
  batch: ['batch', 'batchid', 'batchnumber', 'الباتش', 'رقمالباتش', 'باتش'],
  wallet: ['wallet', 'walletbalance', 'balance', 'cash', 'المحفظه', 'قيمهالمحفظه', 'رصيدالمحفظه', 'الرصيد', 'عهدهماليه'],
};

function findColumnIndex(normalizedHeaders: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const exactIdx = normalizedHeaders.findIndex((h) => h === alias);
    if (exactIdx !== -1) return exactIdx;
  }
  for (const alias of aliases) {
    if (alias.length < 3) continue;
    const partialIdx = normalizedHeaders.findIndex((h) => h.includes(alias));
    if (partialIdx !== -1) return partialIdx;
  }
  return -1;
}

/**
 * تحليل صفوف Google Sheets وتحويلها إلى مناديب وسجلات حضور وتحديثات محافظ/باتش متوافقة تماماً مع Cloud Firestore
 */
export function parseGoogleSheetRowsToShiftData(
  rows: string[][],
  options?: {
    targetYear?: number;
    targetMonth?: number;
    existingEmployees?: Employee[];
    defaultTeamId?: string;
  }
): ParsedGoogleSheetShiftData {
  const now = new Date();
  const targetYear = options?.targetYear || now.getFullYear();
  const targetMonth = options?.targetMonth || now.getMonth() + 1;
  const existingByCode = new Map<string, Employee>();
  const existingById = new Map<string, Employee>();

  (options?.existingEmployees || []).forEach((emp) => {
    existingById.set(emp.id.toLowerCase(), emp);
    existingByCode.set(emp.employeeCode.toLowerCase(), emp);
  });

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length < 2) {
    throw new Error(
      'ورقة العمل المختارة فارغة أو تحتوي على صف العناوين فقط دون بيانات مناديب.'
    );
  }

  // البحث عن صف العناوين ضمن أول 5 صفوف لتجاوز أي عنوان ترويسة علوي في الشيت
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, nonEmptyRows.length); i++) {
    const candidateNorm = nonEmptyRows[i].map(normalizeHeaderKey);
    const hasName = findColumnIndex(candidateNorm, HEADER_ALIASES.name) !== -1;
    const hasCode = findColumnIndex(candidateNorm, HEADER_ALIASES.code) !== -1;
    if (hasName || hasCode) {
      headerRowIdx = i;
      break;
    }
  }

  const headerRow = nonEmptyRows[headerRowIdx];
  const normalizedHeaders = headerRow.map(normalizeHeaderKey);

  let codeIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.code);
  let nameIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.name);

  if (codeIdx === -1 && nameIdx === -1) {
    codeIdx = 0;
    nameIdx = headerRow.length > 1 ? 1 : 0;
  }

  const phoneIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.phone);
  const hireDateIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.hireDate);
  const empStatusIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.empStatus);
  const teamIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.teamId);
  const notesIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.notes);
  const dateIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.date);
  const shiftSelIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.shiftSelection);
  const attendanceIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.attendance);
  const startIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.startTime);
  const endIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.endTime);
  const breakIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.breakMinutes);
  const batchIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.batch);
  const walletIdx = findColumnIndex(normalizedHeaders, HEADER_ALIASES.wallet);

  const reservedCols = new Set(
    [
      codeIdx,
      nameIdx,
      phoneIdx,
      hireDateIdx,
      empStatusIdx,
      teamIdx,
      notesIdx,
      dateIdx,
      shiftSelIdx,
      attendanceIdx,
      startIdx,
      endIdx,
      breakIdx,
      batchIdx,
      walletIdx,
    ].filter((idx) => idx >= 0)
  );

  // اكتشاف أعمدة الأيام إذا كان الشيت مصفوفة شهرية (1..31 أو تواريخ في رؤوس الأعمدة)
  const dayColumns: Array<{ colIndex: number; dateStr: string }> = [];
  if (dateIdx === -1) {
    headerRow.forEach((rawHeader, colIdx) => {
      if (reservedCols.has(colIdx)) return;
      const maybeDate = normalizeDateCell(rawHeader, targetYear, targetMonth);
      if (maybeDate) {
        dayColumns.push({ colIndex: colIdx, dateStr: maybeDate });
      }
    });
  }

  const layoutMode: ParsedGoogleSheetShiftData['layoutMode'] =
    dayColumns.length >= 2 ? 'monthly_matrix' : 'transactional_rows';

  const employeesMap = new Map<string, Employee>();
  const attendanceRecords: Record<string, AttendanceRecord> = {};
  const telemetryMap = new Map<string, SheetTelemetryImportItem>();
  const warnings: string[] = [];
  let skippedRows = 0;

  const dataRows = nonEmptyRows.slice(headerRowIdx + 1);

  dataRows.forEach((row, idx) => {
    const rawCode = codeIdx >= 0 ? row[codeIdx] || '' : '';
    const rawName = nameIdx >= 0 ? row[nameIdx] || '' : '';

    if (!rawCode && !rawName) {
      skippedRows++;
      return;
    }

    // تجاهل صفوف الإجمالي في أسفل الشيت
    const normalizedNameCheck = normalizeHeaderKey(rawName || rawCode);
    if (
      normalizedNameCheck === 'الاجمالي' ||
      normalizedNameCheck === 'المجموع' ||
      normalizedNameCheck === 'total'
    ) {
      skippedRows++;
      return;
    }

    const existingMatch =
      (rawCode && existingByCode.get(rawCode.toLowerCase())) ||
      (rawCode && existingById.get(rawCode.toLowerCase())) ||
      undefined;

    const resolvedCode = (rawCode || existingMatch?.employeeCode || `EMP_${idx + 1}`).slice(
      0,
      64
    );
    const empId = existingMatch?.id || sanitizeDocId(resolvedCode) || `EMP_${idx + 1}`;
    const resolvedName = (
      rawName ||
      existingMatch?.fullName ||
      `مندوب ${resolvedCode}`
    ).slice(0, 120);

    if (resolvedName.length < 2) {
      skippedRows++;
      return;
    }

    const rawTeam = teamIdx >= 0 ? sanitizeDocId(row[teamIdx] || '') : '';
    const resolvedTeamId =
      rawTeam || existingMatch?.teamId || options?.defaultTeamId || '';

    const rawEmpStatus = empStatusIdx >= 0 ? normalizeHeaderKey(row[empStatusIdx] || '') : '';
    const empStatus: Employee['status'] =
      rawEmpStatus === 'suspended' || rawEmpStatus === 'موقوف' || rawEmpStatus === 'معطل'
        ? 'suspended'
        : existingMatch?.status || 'active';

    const rawHireDate =
      (hireDateIdx >= 0 && normalizeDateCell(row[hireDateIdx] || '', targetYear, targetMonth)) ||
      existingMatch?.hireDate ||
      `${targetYear}-01-01`;

    const existingEmpInBatch = employeesMap.get(empId);
    employeesMap.set(empId, {
      id: empId,
      employeeCode: resolvedCode,
      fullName: resolvedName,
      phone: (
        (phoneIdx >= 0 ? row[phoneIdx] : '') ||
        existingEmpInBatch?.phone ||
        existingMatch?.phone ||
        ''
      ).slice(0, 32),
      hireDate: rawHireDate,
      status: empStatus,
      externalId: existingMatch?.externalId || `GSHEET_${empId}`,
      teamId: resolvedTeamId,
      userId: existingMatch?.userId || '',
      notes: (
        (notesIdx >= 0 ? row[notesIdx] : '') ||
        existingEmpInBatch?.notes ||
        existingMatch?.notes ||
        'تمت قراءته من Google Sheets'
      ).slice(0, 500),
    });

    // استخراج بيانات الباتش والمحفظة إن توفرت في أعمدة الشيت
    const parsedBatch = batchIdx >= 0 ? parseRepBatch(row[batchIdx] || '') : null;
    const parsedWallet = walletIdx >= 0 ? parseWalletNumber(row[walletIdx] || '') : null;
    if (parsedBatch !== null || parsedWallet !== null) {
      const prevTel = telemetryMap.get(empId);
      telemetryMap.set(empId, {
        employeeId: empId,
        batch: parsedBatch || prevTel?.batch || 'Batch 1',
        walletBalance: parsedWallet ?? prevTel?.walletBalance ?? 0,
      });
    }

    if (layoutMode === 'monthly_matrix') {
      dayColumns.forEach(({ colIndex, dateStr }) => {
        const cellVal = row[colIndex] || '';
        const parsedCell = parseAttendanceCellValue(cellVal);
        if (!parsedCell) return;

        const totalWorkedMinutes =
          parsedCell.attendance === 'worked'
            ? calculateShiftMinutes(parsedCell.startTime, parsedCell.endTime, 30)
            : 0;
        const recKey = `${empId}_${dateStr}`;
        attendanceRecords[recKey] = {
          id: recKey,
          employeeId: empId,
          teamId: resolvedTeamId,
          date: dateStr,
          shiftSelection: parsedCell.shiftSelection,
          attendance: parsedCell.attendance,
          startTime: parsedCell.startTime,
          endTime: parsedCell.endTime,
          breakMinutes: parsedCell.attendance === 'worked' ? 30 : 0,
          totalWorkedMinutes,
          supervisorNotes: '',
          source: 'external_sync',
          updatedAt: new Date().toISOString(),
        };
      });
    } else if (dateIdx >= 0) {
      const rawDate = row[dateIdx] || '';
      const parsedDate = normalizeDateCell(rawDate, targetYear, targetMonth);
      if (!parsedDate) {
        if (rawDate) {
          warnings.push(`تم تخطي تاريخ غير صالح (${rawDate}) للمندوب ${resolvedName}.`);
        }
        return;
      }

      const rawAtt = attendanceIdx >= 0 ? row[attendanceIdx] || '' : '';
      const parsedAttObj = parseAttendanceCellValue(rawAtt);
      const attendance: AttendanceStatus = parsedAttObj?.attendance || 'pending';

      const rawShift = shiftSelIdx >= 0 ? row[shiftSelIdx] || '' : '';
      const shiftSelection = rawShift
        ? parseShiftSelectionValue(rawShift, attendance)
        : parsedAttObj?.shiftSelection || 'selected';

      const startTime = normalizeTimeCell(
        startIdx >= 0 ? row[startIdx] || '' : '',
        parsedAttObj?.startTime || '09:00'
      );
      const endTime = normalizeTimeCell(
        endIdx >= 0 ? row[endIdx] || '' : '',
        parsedAttObj?.endTime || '17:00'
      );
      const rawBreak = breakIdx >= 0 ? Number(normalizeDigitsAndTrim(row[breakIdx] || '')) : NaN;
      const breakMinutes = Number.isFinite(rawBreak)
        ? Math.max(0, Math.min(720, Math.round(rawBreak)))
        : attendance === 'worked'
        ? 30
        : 0;

      const totalWorkedMinutes =
        attendance === 'worked'
          ? calculateShiftMinutes(startTime, endTime, breakMinutes)
          : 0;

      const recKey = `${empId}_${parsedDate}`;
      attendanceRecords[recKey] = {
        id: recKey,
        employeeId: empId,
        teamId: resolvedTeamId,
        date: parsedDate,
        shiftSelection,
        attendance,
        startTime,
        endTime,
        breakMinutes,
        totalWorkedMinutes,
        supervisorNotes: (notesIdx >= 0 ? row[notesIdx] || '' : '').slice(0, 500),
        source: 'external_sync',
        updatedAt: new Date().toISOString(),
      };
    }
  });

  const employees = Array.from(employeesMap.values());
  const telemetryUpdates = Array.from(telemetryMap.values());

  if (employees.length === 0) {
    throw new Error(
      'لم يتم العثور على صفوف مناديب صالحة في ورقة العمل المختارة. تأكد من وجود عمود الاسم أو كود المندوب.'
    );
  }

  return {
    layoutMode,
    employees,
    attendanceRecords,
    telemetryUpdates,
    stats: {
      totalRowsRead: dataRows.length,
      importedEmployees: employees.length,
      importedAttendance: Object.keys(attendanceRecords).length,
      importedTelemetry: telemetryUpdates.length,
      skippedRows,
    },
    warnings: warnings.slice(0, 10),
  };
}
