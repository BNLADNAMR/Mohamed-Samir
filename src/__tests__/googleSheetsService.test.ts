import { describe, expect, it } from 'vitest';
import {
  extractSpreadsheetIdAndGid,
  formatSheetTabRange,
  isGoogleSheetsInput,
  normalizeDigitsAndTrim,
  parseGoogleSheetRowsToShiftData,
  SCOPES,
} from '../services/googleSheetsService';

describe('Google Sheets Service & Shift Data Parser', () => {
  it('configures least-privilege spreadsheets.readonly scope', () => {
    expect(SCOPES).toEqual([
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ]);
  });

  it('extracts spreadsheetId and gid from full Google Sheets URLs and raw IDs', () => {
    const withHashGid = extractSpreadsheetIdAndGid(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=1458291'
    );
    expect(withHashGid).toEqual({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      gid: 1458291,
    });

    const withQueryGid = extractSpreadsheetIdAndGid(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing&gid=0'
    );
    expect(withQueryGid).toEqual({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      gid: 0,
    });

    const rawId = extractSpreadsheetIdAndGid(
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    );
    expect(rawId).toEqual({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      gid: null,
    });

    expect(
      isGoogleSheetsInput('https://api.company.com/shifts-export.json')
    ).toBe(false);
  });

  it('quotes dynamic Arabic and single-quoted sheet tab titles safely', () => {
    expect(formatSheetTabRange('شفتات نوفمبر 2026')).toBe("'شفتات نوفمبر 2026'");
    expect(formatSheetTabRange("Captain's Log", 'A1:H50')).toBe(
      "'Captain''s Log'!A1:H50"
    );
  });

  it('normalizes Eastern Arabic numerals and trims hidden characters', () => {
    expect(normalizeDigitsAndTrim('  ٢٠٢٦-١١-٠٤ \u200B')).toBe('2026-11-04');
  });

  it('parses transactional Arabic Google Sheets rows including batch and wallet telemetry', () => {
    const rows = [
      [
        'كود المندوب',
        'اسم المندوب',
        'الجوال',
        'الفريق',
        'التاريخ',
        'اختيار الشفت',
        'الحضور',
        'من',
        'إلى',
        'الاستراحة',
        'الباتش',
        'المحفظة',
      ],
      [
        'EMP101',
        'أحمد محمود',
        '01012345678',
        'TEAM_CAIRO',
        '٢٠٢٦-١١-٠٤',
        'نعم',
        'حضر',
        '09:00',
        '17:00',
        '30',
        'باتش ٤',
        '2,450.50 ج.م',
      ],
      [
        'EMP102',
        'كريم عادل',
        '01198765432',
        'TEAM_CAIRO',
        '04/11/2026',
        'نعم',
        'غائب',
        '',
        '',
        '0',
        'Batch 1',
        '3100',
      ],
    ];

    const parsed = parseGoogleSheetRowsToShiftData(rows, {
      targetYear: 2026,
      targetMonth: 11,
    });

    expect(parsed.layoutMode).toBe('transactional_rows');
    expect(parsed.employees).toHaveLength(2);
    expect(parsed.employees[0].fullName).toBe('أحمد محمود');
    expect(parsed.employees[0].teamId).toBe('TEAM_CAIRO');

    const rec1 = parsed.attendanceRecords['EMP101_2026-11-04'];
    expect(rec1).toBeDefined();
    expect(rec1.attendance).toBe('worked');
    expect(rec1.shiftSelection).toBe('selected');
    expect(rec1.totalWorkedMinutes).toBe(450);
    expect(rec1.source).toBe('external_sync');

    const rec2 = parsed.attendanceRecords['EMP102_2026-11-04'];
    expect(rec2).toBeDefined();
    expect(rec2.attendance).toBe('absent');
    expect(rec2.totalWorkedMinutes).toBe(0);

    expect(parsed.telemetryUpdates).toEqual([
      { employeeId: 'EMP101', batch: 'Batch 4', walletBalance: 2450.5 },
      { employeeId: 'EMP102', batch: 'Batch 1', walletBalance: 3100 },
    ]);
  });

  it('parses wide monthly matrix Google Sheets layouts (days 1..31)', () => {
    const rows = [
      ['الكود', 'الاسم', '1', '2', '3', '4'],
      ['R201', 'محمود سامي', 'حضر', 'غائب', 'إجازة', '08:00-16:30'],
      ['الإجمالي', '', '1', '1', '1', '1'],
    ];

    const parsed = parseGoogleSheetRowsToShiftData(rows, {
      targetYear: 2026,
      targetMonth: 11,
    });

    expect(parsed.layoutMode).toBe('monthly_matrix');
    expect(parsed.employees).toHaveLength(1);
    expect(parsed.stats.importedAttendance).toBe(4);
    expect(parsed.attendanceRecords['R201_2026-11-01'].attendance).toBe('worked');
    expect(parsed.attendanceRecords['R201_2026-11-02'].attendance).toBe('absent');
    expect(parsed.attendanceRecords['R201_2026-11-03'].attendance).toBe('leave');
    expect(parsed.attendanceRecords['R201_2026-11-03'].shiftSelection).toBe('exempt');
    expect(parsed.attendanceRecords['R201_2026-11-04'].startTime).toBe('08:00');
    expect(parsed.attendanceRecords['R201_2026-11-04'].endTime).toBe('16:30');
    expect(parsed.attendanceRecords['R201_2026-11-04'].totalWorkedMinutes).toBe(480);
  });
});
