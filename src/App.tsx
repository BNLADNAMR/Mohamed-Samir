import React, { useEffect, useState } from 'react';
import {
  Shield,
  Users,
  UserCheck,
  Calendar,
  FileText,
  ShieldAlert,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  LayoutDashboard,
  User,
  Settings,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { DashboardOverviewPage } from './components/DashboardOverviewPage';
import { ShiftsCalendarPage } from './components/ShiftsCalendarPage';
import { EmployeesManagementPage } from './components/EmployeesManagementPage';
import { TeamsManagementPage } from './components/TeamsManagementPage';
import { RequestsWorkflowPage } from './components/RequestsWorkflowPage';
import { UserManagementPage } from './components/UserManagementPage';
import { AuditLogsPage } from './components/AuditLogsPage';
import { SecuritySettingsPage } from './components/SecuritySettingsPage';
import { RepresentativePortalPage } from './components/RepresentativePortalPage';
import {
  AttendanceRecord,
  AuditLogItem,
  Employee,
  Team,
  UserProfile,
  WorkflowRequest,
} from './types';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { ROLE_SHORT_LABELS_AR } from './utils/rbac';

export function App() {
  const {
    firebaseUser,
    userProfile,
    securityPolicy,
    isAuthReady,
    denyReason,
    logout,
  } = useAuth();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // البيانات الفعلية من Cloud Firestore
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // رسائل التنبيه العائمة
  const [notification, setNotification] = useState<{
    msg: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);

  const notify = (msg: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // تبديل الوضع الداكن / الفاتح
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // الاشتراك في بيانات Firestore في الوقت الفعلي عند توفر مستخدم مصرح له
  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.status !== 'active') return;

    // 1. المندوبون
    const unsubEmployees = onSnapshot(
      collection(db, 'employees'),
      (snapshot) => {
        const emps: Employee[] = [];
        snapshot.forEach((doc) => emps.push(doc.data() as Employee));
        setEmployees(emps);
      },
      (err) => console.warn('Employees sync notice:', err)
    );

    // 2. الحضور والانصراف
    const unsubAttendance = onSnapshot(
      collection(db, 'attendance'),
      (snapshot) => {
        const records: Record<string, AttendanceRecord> = {};
        snapshot.forEach((doc) => {
          const rec = doc.data() as AttendanceRecord;
          records[rec.id] = rec;
        });
        setAttendanceRecords(records);
      },
      (err) => console.warn('Attendance sync notice:', err)
    );

    // 3. فرق العمل
    const unsubTeams = onSnapshot(
      collection(db, 'teams'),
      (snapshot) => {
        const tms: Team[] = [];
        snapshot.forEach((doc) => tms.push(doc.data() as Team));
        setTeams(tms);
      },
      (err) => console.warn('Teams sync notice:', err)
    );

    // 4. الطلبات
    const unsubRequests = onSnapshot(
      collection(db, 'requests'),
      (snapshot) => {
        const reqs: WorkflowRequest[] = [];
        snapshot.forEach((doc) => reqs.push(doc.data() as WorkflowRequest));
        setRequests(reqs);
      },
      (err) => console.warn('Requests sync notice:', err)
    );

    // 5. المستخدمون (للإدارة)
    let unsubUsers = () => {};
    if (userProfile.role === 'super_admin' || userProfile.role === 'operations_manager') {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const usrs: UserProfile[] = [];
          snapshot.forEach((doc) => usrs.push(doc.data() as UserProfile));
          setUsers(usrs);
        },
        (err) => console.warn('Users sync notice:', err)
      );
    }

    // 6. سجل الرقابة
    let unsubAudit = () => {};
    if (userProfile.role === 'super_admin' || userProfile.role === 'operations_manager') {
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(50));
      unsubAudit = onSnapshot(
        q,
        (snapshot) => {
          const logs: AuditLogItem[] = [];
          snapshot.forEach((doc) => logs.push(doc.data() as AuditLogItem));
          setAuditLogs(logs);
        },
        (err) => console.warn('Audit logs sync notice:', err)
      );
    }

    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubTeams();
      unsubRequests();
      unsubUsers();
      unsubAudit();
    };
  }, [firebaseUser, userProfile]);

  // حالة التحميل الأولية
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold">جارٍ التحقق من الهوية والصلاحيات السحابية...</p>
        </div>
      </div>
    );
  }

  // إذا لم يسجل الدخول بعد أو كان الحساب معلقاً
  if (!firebaseUser || !userProfile || denyReason) {
    return (
      <AuthScreen
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
      />
    );
  }

  const isSuperAdmin = userProfile.role === 'super_admin';
  const isManager = userProfile.role === 'operations_manager';
  const isRep = userProfile.role === 'delivery_rep';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Cairo',sans-serif]">
      {/* إشعار عائم */}
      {notification && (
        <div
          className={`fixed bottom-5 left-5 z-50 px-4 py-2.5 rounded-xl shadow-xl border text-xs font-bold transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : notification.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : notification.type === 'warning'
              ? 'bg-amber-600 text-white border-amber-500'
              : 'bg-indigo-600 text-white border-indigo-500'
          }`}
        >
          {notification.msg}
        </div>
      )}

      {/* الشريط العلوي */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-700 text-slate-300"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-indigo-400" />
              <div>
                <h1 className="text-base font-extrabold tracking-tight">نظام متابعة الشفتات والمندوبين</h1>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  Zero-Trust RBAC • Live Firestore Engine
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* بطاقة المستخدم */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <div className="text-left hidden sm:block">
                <div className="font-bold text-white">{userProfile.name}</div>
                <div className="text-[10px] text-indigo-300">
                  {ROLE_SHORT_LABELS_AR[userProfile.role] || userProfile.role}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
                {userProfile.name.slice(0, 1)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
              title="تبديل الوضع"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>

            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-lg border border-slate-700 hover:bg-rose-900/60 text-slate-300 hover:text-white cursor-pointer transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* شريط التنقل */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6">
        <div className="max-w-[1500px] mx-auto flex items-center gap-1 overflow-x-auto py-2 text-xs scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>لوحة التحكم</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shifts')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
              activeTab === 'shifts'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>الشفتات والحضور</span>
          </button>

          {isRep && (
            <button
              type="button"
              onClick={() => setActiveTab('rep_portal')}
              className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                activeTab === 'rep_portal'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <User className="w-4 h-4" />
              <span>بوابتي كمندوب</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
              activeTab === 'requests'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>الطلبات والإجازات</span>
          </button>

          {(isSuperAdmin || isManager) && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('employees')}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  activeTab === 'employees'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>المندوبون</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('teams')}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  activeTab === 'teams'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>فرق العمل</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  activeTab === 'users'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>إدارة المستخدمين</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  activeTab === 'audit'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>سجل العمليات</span>
              </button>
            </>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('security_settings')}
              className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                activeTab === 'security_settings'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>سياسات الأمان</span>
            </button>
          )}
        </div>
      </nav>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto p-4 sm:p-6">
        {activeTab === 'dashboard' && (
          <DashboardOverviewPage
            currentUser={userProfile}
            employees={employees}
            users={users}
            teams={teams}
            attendanceRecords={attendanceRecords}
            requests={requests}
            onNavigate={(page) => setActiveTab(page)}
          />
        )}

        {activeTab === 'shifts' && (
          <ShiftsCalendarPage
            currentUser={userProfile}
            employees={employees}
            attendanceRecords={attendanceRecords}
            teams={teams}
            onNotify={notify}
          />
        )}

        {activeTab === 'rep_portal' && (
          <RepresentativePortalPage
            currentUser={userProfile}
            employees={employees}
            attendanceRecords={attendanceRecords}
            teams={teams}
            onNavigateToRequests={() => setActiveTab('requests')}
          />
        )}

        {activeTab === 'requests' && (
          <RequestsWorkflowPage
            currentUser={userProfile}
            requests={requests}
            employees={employees}
            onNotify={notify}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeesManagementPage
            currentUser={userProfile}
            employees={employees}
            teams={teams}
            onNotify={notify}
          />
        )}

        {activeTab === 'teams' && (
          <TeamsManagementPage
            currentUser={userProfile}
            teams={teams}
            users={users}
            onNotify={notify}
          />
        )}

        {activeTab === 'users' && (
          <UserManagementPage
            currentUser={userProfile}
            securityPolicy={securityPolicy}
            users={users}
            invitations={[]}
            employees={employees}
            teams={teams}
            onSendPasswordReset={async () => 'تم إرسال رابط إعادة التعيين.'}
            onNotify={notify}
          />
        )}

        {activeTab === 'audit' && <AuditLogsPage logs={auditLogs} />}

        {activeTab === 'security_settings' && (
          <SecuritySettingsPage
            currentUser={userProfile}
            securityPolicy={securityPolicy}
            onNotify={notify}
          />
        )}
      </main>
    </div>
  );
}

export default App;
