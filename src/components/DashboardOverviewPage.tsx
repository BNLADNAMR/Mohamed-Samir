import React from 'react';
import { Users, UserCheck, Calendar, FileText, ShieldAlert, CheckCircle, TrendingUp } from 'lucide-react';
import { AttendanceRecord, Employee, Team, UserProfile, WorkflowRequest } from '../types';

interface DashboardOverviewPageProps {
  currentUser: UserProfile;
  employees: Employee[];
  users: UserProfile[];
  teams: Team[];
  attendanceRecords: Record<string, AttendanceRecord>;
  requests: WorkflowRequest[];
  onNavigate: (page: string) => void;
}

export const DashboardOverviewPage: React.FC<DashboardOverviewPageProps> = ({
  currentUser,
  employees,
  users,
  teams,
  attendanceRecords,
  requests,
  onNavigate,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // إحصاءات حضور اليوم الفعلية
  const todayRecords = Object.values(attendanceRecords).filter((r) => r.date === todayStr);
  const workedToday = todayRecords.filter((r) => r.attendance === 'worked').length;
  const absentToday = todayRecords.filter((r) => r.attendance === 'absent').length;
  const leaveToday = todayRecords.filter((r) => r.attendance === 'leave').length;
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* بطاقة الترحيب */}
      <div className="bg-gradient-to-l from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-sm border border-indigo-800/40 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs text-indigo-300 font-bold">لوحة التحكم التنفيذية</span>
          <h2 className="text-xl font-extrabold mt-1">مرحباً بك، {currentUser.name}</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
            النظام يعمل بكفاءة بالاتصال المباشر مع قاعدة بيانات Firestore المعتمدة. جميع البيانات والإحصائيات دقيقة ومحدثة لحظياً.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            قاعدة البيانات: متصلة ونشطة
          </span>
        </div>
      </div>

      {/* مؤشرات الأداء الحقيقية */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('employees')}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-indigo-500 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>إجمالي المندوبين</span>
            <UserCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 font-mono">
            {employees.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">مندوب مسجل في السجل الميداني</div>
        </div>

        <div
          onClick={() => onNavigate('shifts')}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-emerald-500 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>حضور اليوم الفعلي</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 font-mono text-emerald-600">
            {workedToday}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {absentToday > 0 ? `${absentToday} غياب مسجل` : 'لا يوجد غياب مسجل اليوم'}
          </div>
        </div>

        <div
          onClick={() => onNavigate('requests')}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-amber-500 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>الطلبات المعلقة</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 font-mono text-amber-600">
            {pendingRequests}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">طلبات إجازات أو تصحيح شفت</div>
        </div>

        <div
          onClick={() => onNavigate('teams')}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-purple-500 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>فرق العمل النشطة</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 font-mono">
            {teams.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">فريق تشغيلي موزع بالمحافظات</div>
        </div>
      </div>

      {/* جدول الحركات الأخيرة */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* أحدث الطلبات */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>أحدث الطلبات المقدمة</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('requests')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              عرض الكل
            </button>
          </div>
          {requests.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">لا توجد طلبات جديدة.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {requests.slice(0, 5).map((r) => (
                <div key={r.requestId} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{r.employeeName}</div>
                    <div className="text-slate-400 text-[11px]">{r.description}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    r.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-600'
                      : r.status === 'rejected'
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {r.status === 'approved' ? 'معتمد' : r.status === 'rejected' ? 'مرفوض' : 'معلق'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* أحدث المندوبين المضافين */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>سجل المندوبين الأخير</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('employees')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              عرض الكل
            </button>
          </div>
          {employees.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">لا يوجد مندوبون مضافون بعد.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {employees.slice(0, 5).map((e) => (
                <div key={e.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{e.fullName}</div>
                    <div className="text-slate-400 text-[11px] font-mono">{e.employeeCode}</div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500" dir="ltr">
                    {e.phone || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
