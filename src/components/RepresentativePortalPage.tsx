import React, { useState } from 'react';
import { User, Calendar, Clock, CheckCircle, Shield, Phone, Briefcase } from 'lucide-react';
import { AttendanceRecord, Employee, Team, UserProfile } from '../types';

interface RepresentativePortalPageProps {
  currentUser: UserProfile;
  employees: Employee[];
  attendanceRecords: Record<string, AttendanceRecord>;
  teams: Team[];
  onNavigateToRequests: () => void;
}

export const RepresentativePortalPage: React.FC<RepresentativePortalPageProps> = ({
  currentUser,
  employees,
  attendanceRecords,
  teams,
  onNavigateToRequests,
}) => {
  const linkedEmployee = employees.find(
    (e) => e.userId === currentUser.uid || e.id === currentUser.employeeId
  );
  const team = teams.find((t) => t.teamId === currentUser.teamId || t.teamId === linkedEmployee?.teamId);

  // حساب إحصاءات الحضور الفعلية
  const myRecords = Object.values(attendanceRecords).filter(
    (r) => r.employeeId === linkedEmployee?.id || (currentUser.employeeId && r.employeeId === currentUser.employeeId)
  );

  const workedDays = myRecords.filter((r) => r.attendance === 'worked').length;
  const absentDays = myRecords.filter((r) => r.attendance === 'absent').length;
  const leaveDays = myRecords.filter((r) => r.attendance === 'leave').length;

  return (
    <div className="space-y-6">
      {/* بطاقة تعريف المندوب */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xl">
            {currentUser.name.slice(0, 1)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{currentUser.name}</h2>
              <span className="text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                مندوب (Representative)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>الكود: <strong className="font-mono text-slate-800 dark:text-slate-200">{linkedEmployee?.employeeCode || '—'}</strong></span>
              <span>•</span>
              <span>الفريق: <strong className="text-slate-800 dark:text-slate-200">{team?.teamName || 'غير مخصص'}</strong></span>
              <span>•</span>
              <span>الهاتف: <strong className="font-mono text-slate-800 dark:text-slate-200" dir="ltr">{currentUser.phone || linkedEmployee?.phone || '—'}</strong></span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onNavigateToRequests}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          تقديم طلب إجازة أو عذر
        </button>
      </div>

      {/* بطاقات الإحصاءات الفعلية */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>أيام الحضور الفعلي</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {workedDays} <span className="text-xs font-normal text-slate-400">شفت</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>أيام الإجازات المعتمدة</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {leaveDays} <span className="text-xs font-normal text-slate-400">يوم</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>الغياب المسجل</span>
            <Clock className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {absentDays} <span className="text-xs font-normal text-slate-400">يوم</span>
          </div>
        </div>
      </div>

      {/* سجل الحضور الأخير */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-bold text-xs">
          سجل الشفتات والحضور الشخصي
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>
                <th className="p-3">التاريخ</th>
                <th className="p-3">تحديد الشفت</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">المواعيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {myRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">
                    لم يُسجل لك شفتات أو حضور حتى الآن.
                  </td>
                </tr>
              ) : (
                myRecords.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-mono">{r.date}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                        {r.shiftSelection === 'selected' ? 'محدد' : 'غير محدد'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.attendance === 'worked' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {r.attendance === 'worked' ? 'حاضر' : r.attendance === 'leave' ? 'إجازة' : 'غائب'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">
                      {r.startTime} - {r.endTime}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
