import React, { useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Edit3,
  KeyRound,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Power,
  X,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  AccountStatus,
  Employee,
  PermissionKey,
  PreprovisionedInvitation,
  SecurityPolicySettings,
  Team,
  UserProfile,
  UserRole,
} from '../types';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  ROLE_LABELS_AR,
  ROLE_SHORT_LABELS_AR,
} from '../utils/rbac';
import {
  createPreprovisionedUser,
  deletePreprovisionedInvitationByAdmin,
  deleteUserAccountByAdmin,
  updatePreprovisionedInvitationByAdmin,
  updateUserAccountByAdmin,
} from '../services/firestoreService';

interface UserManagementPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  users: UserProfile[];
  invitations: PreprovisionedInvitation[];
  employees: Employee[];
  teams: Team[];
  onSendPasswordReset: (email: string) => Promise<string>;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  embedded?: boolean;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = ({
  currentUser,
  securityPolicy,
  users,
  invitations,
  employees,
  teams,
  onSendPasswordReset,
  onNotify,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // نوافذ التعديل والإضافة
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('delivery_rep');
  const [newStatus, setNewStatus] = useState<AccountStatus>('active');
  const [newTeamId, setNewTeamId] = useState<string>('');
  const [newEmployeeId, setNewEmployeeId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // تصفية المستخدمين
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchTerm.toLowerCase();
      const matchQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        u.uid.toLowerCase().includes(q);

      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;

      return matchQuery && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setNewRole(user.role);
    setNewStatus(user.status);
    setNewTeamId(user.teamId || '');
    setNewEmployeeId(user.employeeId || '');
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    try {
      await updateUserAccountByAdmin(
        currentUser,
        editingUser.uid,
        {
          role: newRole,
          status: newStatus,
          teamId: newTeamId,
          employeeId: newEmployeeId,
        },
        `تعديل الدور إلى ${newRole} والحالة إلى ${newStatus}`
      );
      onNotify('تم حفظ تعديلات المستخدم والصلاحيات بنجاح.', 'success');
      setEditingUser(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ التعديلات.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    if (user.uid === currentUser.uid) {
      onNotify('لا يمكنك تعطيل حسابك الشخصي الحالي.', 'warning');
      return;
    }
    const targetStatus: AccountStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await updateUserAccountByAdmin(
        currentUser,
        user.uid,
        { status: targetStatus },
        `تبديل حالة الحساب إلى ${targetStatus}`
      );
      onNotify(`تم ${targetStatus === 'active' ? 'تفعيل' : 'إيقاف'} الحساب بنجاح.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر تعديل الحالة.', 'error');
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (!isSuperAdmin) {
      onNotify('حذف الحسابات مقصور على مدير النظام العام (Super Admin).', 'error');
      return;
    }
    if (user.role === 'super_admin') {
      onNotify('لا يمكن حذف حساب مدير نظام.', 'error');
      return;
    }
    if (window.confirm(`هل أنت متأكد من حذف حساب (${user.name}) نهائياً؟`)) {
      try {
        await deleteUserAccountByAdmin(currentUser, user.uid, user.email);
        onNotify('تم حذف الحساب بنجاح.', 'success');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'فشل حذف الحساب.', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* الرأس */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>إدارة المستخدمين والصلاحيات (RBAC)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            إدارة الحسابات المسجلة فعلياً في قاعدة البيانات، ترقية وتخفيض الأدوار، وتفعيل أو إيقاف الحسابات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900">
            إجمالي الحسابات: {users.length}
          </span>
        </div>
      </div>

      {/* شريط البحث والتصفية */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم، البريد أو الهاتف..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        >
          <option value="all">جميع الأدوار ({users.length})</option>
          <option value="super_admin">مدير النظام (Super Admin)</option>
          <option value="operations_manager">مدير العمليات (Operations Manager)</option>
          <option value="supervisor">مشرف فريق (Supervisor)</option>
          <option value="delivery_rep">مندوب (Representative)</option>
          <option value="viewer">مراقب (Viewer)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        >
          <option value="all">جميع الحالات</option>
          <option value="active">نشط (Active)</option>
          <option value="disabled">موقوف (Disabled)</option>
          <option value="pending">بانتظار التفعيل (Pending)</option>
        </select>
      </div>

      {/* جدول المستخدمين */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">المستخدم</th>
                <th className="p-3.5">الدور (Role)</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">الفريق / المندوب المرتبط</th>
                <th className="p-3.5">تاريخ التسجيل</th>
                <th className="p-3.5 text-center">إجراءات الإدارة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا يوجد مستخدمون مطابقون لمعايير البحث.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{user.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                        {user.email || user.phone || user.uid}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${
                        user.role === 'super_admin'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                          : user.role === 'operations_manager'
                          ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900'
                          : user.role === 'supervisor'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                      }`}>
                        {ROLE_SHORT_LABELS_AR[user.role] || user.role}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        user.status === 'active'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                          : user.status === 'disabled'
                          ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                      }`}>
                        {user.status === 'active' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> نشط
                          </>
                        ) : user.status === 'disabled' ? (
                          <>
                            <XCircle className="w-3 h-3" /> موقوف
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3" /> بانتظار التفعيل
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500">
                      {user.teamId ? (
                        <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                          فريق: {teams.find((t) => t.teamId === user.teamId)?.teamName || user.teamId}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono text-[10px]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                          title="تعديل الدور والصلاحيات"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          className={`p-1.5 rounded-lg border cursor-pointer ${
                            user.status === 'active'
                              ? 'border-amber-200 hover:bg-amber-50 text-amber-600 dark:border-amber-900 dark:hover:bg-amber-950/50'
                              : 'border-emerald-200 hover:bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:hover:bg-emerald-950/50'
                          }`}
                          title={user.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        {isSuperAdmin && user.role !== 'super_admin' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 cursor-pointer"
                            title="حذف الحساب"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة تعديل الدور والحالة */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                تعديل صلاحيات المستخدم: {editingUser.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold block mb-1">الدور الوظيفي (Role)</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                >
                  <option value="delivery_rep">مندوب (Representative) - الدور الافتراضي</option>
                  <option value="supervisor">مشرف فريق (Supervisor)</option>
                  <option value="operations_manager">مدير العمليات (Operations Manager)</option>
                  {isSuperAdmin && <option value="super_admin">مدير النظام العام (Super Admin)</option>}
                  <option value="viewer">مراقب قراءة فقط (Viewer)</option>
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">حالة الحساب (Account Status)</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as AccountStatus)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                >
                  <option value="active">نشط (Active) — يستطيع تسجيل الدخول</option>
                  <option value="disabled">موقوف (Disabled) — يُمنع من الدخول</option>
                  <option value="pending">قيد الانتظار (Pending Verification)</option>
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">الفريق التابع له</label>
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                >
                  <option value="">بدون فريق محدد</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveUser}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {isSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-bold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
