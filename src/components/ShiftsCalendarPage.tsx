import React, { useState } from 'react';
import { Calendar, Clock, Check, X, AlertCircle } from 'lucide-react';
import { AttendanceRecord, Employee, Team, UserProfile } from '../types';
import { recordAttendance } from '../services/firestoreService';

interface ShiftsCalendarPageProps {
  currentUser: UserProfile;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  teams: Team[];
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const ShiftsCalendarPage: React.FC<ShiftsCalendarPageProps> = ({
  currentUser,
  employees,
  attendanceRecords,
  teams,
  onNotify,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedTeam, setSelectedTeam] = useState('all');

  const filteredEmployees = employees.filter((emp) => {
    return selectedTeam === 'all' || emp.teamId === selectedTeam;
  });

  const handleUpdateStatus = async (
    empId: string,
    attendance: AttendanceRecord['attendance'],
    shiftSelection: AttendanceRecord['shiftSelection']
  ) => {
    const recordId = `${empId}_${selectedDate}`;
    const existing = attendanceRecords[recordId];

    const record: AttendanceRecord = {
      id: recordId,
      employeeId: empId,
      teamId: employees.find((e) => e.id === empId)?.teamId || '',
      date: selectedDate,
      attendance,
      shiftSelection,
      startTime: existing?.startTime || '09:00',
      endTime: existing?.endTime || '17:00',
      breakMinutes: existing?.breakMinutes || 60,
      totalWorkedMinutes: attendance === 'worked' ? 480 : 0,
      updatedAt: new Date().toISOString(),
    };

    try {
      await recordAttendance(currentUser, record);
      onNotify('تم تحديث حالة الشفت بنجاح.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ حالة الشفت.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>جدول الشفتات وحضور المندوبين</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تسجيل واعتماد حضور الشفتات، الإجازات، والغياب اليومي في الوقت الفعلي.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono"
          />
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs"
          >
            <option value="all">جميع الفرق</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.teamName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">المندوب</th>
                <th className="p-3.5">الفريق</th>
                <th className="p-3.5">تحديد الشفت</th>
                <th className="p-3.5">حالة الحضور</th>
                <th className="p-3.5">ساعات العمل</th>
                <th className="p-3.5 text-center">الإجراء السريع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا يوجد مندوبون لعرضهم في هذا التاريخ.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const recordKey = `${emp.id}_${selectedDate}`;
                  const record = attendanceRecords[recordKey];
                  const attendance = record?.attendance || 'pending';
                  const shiftSelection = record?.shiftSelection || 'undecided';

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{emp.fullName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{emp.employeeCode}</div>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-300">
                        {teams.find((t) => t.teamId === emp.teamId)?.teamName || 'بدون فريق'}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          shiftSelection === 'selected'
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}>
                          {shiftSelection === 'selected' ? 'محدد' : 'غير محدد'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          attendance === 'worked'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                            : attendance === 'absent'
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'
                            : attendance === 'leave'
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}>
                          {attendance === 'worked'
                            ? 'حاضر'
                            : attendance === 'absent'
                            ? 'غائب'
                            : attendance === 'leave'
                            ? 'إجازة'
                            : 'معلق'}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-500">
                        {record?.startTime || '09:00'} - {record?.endTime || '17:00'}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'worked', 'selected')}
                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold text-[11px] cursor-pointer"
                          >
                            حضور
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'absent', 'not_selected')}
                            className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 font-bold text-[11px] cursor-pointer"
                          >
                            غياب
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'leave', 'exempt')}
                            className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-bold text-[11px] cursor-pointer"
                          >
                            إجازة
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
