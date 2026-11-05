import React, { useState } from 'react';
import { Shield, Lock, Save, AlertTriangle, Key } from 'lucide-react';
import { SecurityPolicySettings, UserProfile, UserRole } from '../types';
import { updateSecuritySettings } from '../services/firestoreService';

interface SecuritySettingsPageProps {
  currentUser: UserProfile;
  securityPolicy: SecurityPolicySettings;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SecuritySettingsPage: React.FC<SecuritySettingsPageProps> = ({
  currentUser,
  securityPolicy,
  onNotify,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';

  const [autoProvisionRole, setAutoProvisionRole] = useState<UserRole>(
    securityPolicy.autoProvisionDefaultRole || 'delivery_rep'
  );
  const [autoProvisionStatus, setAutoProvisionStatus] = useState<'active' | 'pending'>(
    securityPolicy.autoProvisionDefaultStatus || 'active'
  );
  const [emergencyReadOnly, setEmergencyReadOnly] = useState(
    Boolean(securityPolicy.emergencyReadOnlyMode)
  );
  const [systemLockdown, setSystemLockdown] = useState(
    Boolean(securityPolicy.systemLockdownMode)
  );
  const [lockdownMessage, setLockdownMessage] = useState(
    securityPolicy.lockdownMessage || ''
  );
  const [sessionTimeout, setSessionTimeout] = useState(
    securityPolicy.sessionTimeoutMinutes || 60
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      onNotify('تعديل إعدادات الأمان مقصور على مدير النظام العام (Super Admin).', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await updateSecuritySettings(currentUser, {
        autoProvisionDefaultRole: autoProvisionRole as Exclude<UserRole, 'super_admin'>,
        autoProvisionDefaultStatus: autoProvisionStatus,
        emergencyReadOnlyMode: emergencyReadOnly,
        systemLockdownMode: systemLockdown,
        lockdownMessage: lockdownMessage.trim(),
        sessionTimeoutMinutes: Number(sessionTimeout),
      });
      onNotify('تم تحديث وتطبيق سياسات الأمان في Firestore بنجاح.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر حفظ إعدادات الأمان.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span>مركز سياسات الأمان وإعدادات النظام (RBAC Security)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            التحكم في السياسات المركزية، الدور الافتراضي للحسابات الجديدة، وأوضاع الطوارئ المعتمدة على Cloud Firestore.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl text-xs">
        {/* قسم سياسة التسجيل الجديد */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-600" />
            <span>سياسة الحسابات والتسجيل الجديد</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold block mb-1">الدور الافتراضي لأي مستخدم جديد</label>
              <select
                disabled={!isSuperAdmin}
                value={autoProvisionRole}
                onChange={(e) => setAutoProvisionRole(e.target.value as UserRole)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
              >
                <option value="delivery_rep">مندوب (Representative) — موصى به</option>
                <option value="viewer">مراقب قراءة فقط (Viewer)</option>
                <option value="supervisor">مشرف فريق (Supervisor)</option>
              </select>
              <span className="text-[10px] text-slate-400 block mt-1">
                تمنع قواعد Firestore أي مستخدم من اختيار دور أعلى تلقائياً.
              </span>
            </div>

            <div>
              <label className="font-bold block mb-1">حالة الحساب المبدئية</label>
              <select
                disabled={!isSuperAdmin}
                value={autoProvisionStatus}
                onChange={(e) => setAutoProvisionStatus(e.target.value as 'active' | 'pending')}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
              >
                <option value="active">نشط فوراً (Active)</option>
                <option value="pending">بانتظار موافقة الإدارة (Pending Verification)</option>
              </select>
            </div>
          </div>
        </div>

        {/* قسم مهلة الجلسة وأمان الحساب */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600" />
            <span>مهلة الجلسة النشطة</span>
          </h3>
          <div>
            <label className="font-bold block mb-1">المهلة الزمنية لإغلاق الجلسة غير النشطة (بالدقائق)</label>
            <input
              type="number"
              min={5}
              max={1440}
              disabled={!isSuperAdmin}
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(Number(e.target.value))}
              className="w-48 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono bg-white dark:bg-slate-800"
            />
          </div>
        </div>

        {/* قسم أوضاع الطوارئ والقفل الأمني */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 text-rose-600">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>أوضاع الطوارئ والحماية القصوى</span>
          </h3>

          <div className="space-y-3">
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={emergencyReadOnly}
                onChange={(e) => setEmergencyReadOnly(e.target.checked)}
                className="w-4 h-4 accent-rose-600 rounded"
              />
              <span>وضع القراءة فقط في حالات الطوارئ (تجميد تعديلات المشرفين والمندوبين)</span>
            </label>

            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={systemLockdown}
                onChange={(e) => setSystemLockdown(e.target.checked)}
                className="w-4 h-4 accent-rose-600 rounded"
              />
              <span>وضع القفل الأمني الكامل (System Lockdown — اقتصار الدخول على Super Admin فقط)</span>
            </label>

            {systemLockdown && (
              <div>
                <label className="font-bold block mb-1">رسالة القفل التي تظهر للمستخدمين عند تسجيل الدخول</label>
                <textarea
                  rows={2}
                  disabled={!isSuperAdmin}
                  value={lockdownMessage}
                  onChange={(e) => setLockdownMessage(e.target.value)}
                  placeholder="النظام في وضع الصيانة الأمنية المؤقتة بأمر من مدير النظام..."
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800"
                />
              </div>
            )}
          </div>
        </div>

        {isSuperAdmin && (
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جارٍ الحفظ وتطبيق القواعد...' : 'حفظ وتطبيق إعدادات الأمان'}</span>
          </button>
        )}
      </form>
    </div>
  );
};
