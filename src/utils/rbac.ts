import {
  AppRoutePage,
  AttendanceRecord,
  Employee,
  PermissionKey,
  SecurityPolicySettings,
  UserProfile,
  UserRole,
  WorkflowRequest,
} from '../types';

export const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'aladdinamrr@gmail.com';

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  super_admin: 'مدير النظام (Super Admin)',
  operations_manager: 'مدير العمليات / مدير (Operations Manager)',
  supervisor: 'مشرف فريق (Supervisor)',
  delivery_rep: 'مندوب (Representative)',
  viewer: 'مراقب قراءة فقط (Viewer)',
};

export const ROLE_SHORT_LABELS_AR: Record<UserRole, string> = {
  super_admin: 'مدير النظام',
  operations_manager: 'مدير العمليات',
  supervisor: 'مشرف فريق',
  delivery_rep: 'مندوب',
  viewer: 'مراقب قراءة فقط',
};

export const ALL_PERMISSIONS: {
  key: PermissionKey;
  label: string;
  group: string;
}[] = [
  { key: 'users.view', label: 'عرض المستخدمين', group: 'المستخدمون' },
  { key: 'users.create', label: 'إنشاء حسابات المستخدمين', group: 'المستخدمون' },
  { key: 'users.edit', label: 'تعديل بيانات المستخدمين', group: 'المستخدمون' },
  { key: 'users.disable', label: 'تعطيل وتفعيل الحسابات', group: 'المستخدمون' },
  { key: 'users.assign_role', label: 'تعيين وتغيير الأدوار', group: 'المستخدمون' },

  { key: 'employees.view_all', label: 'مشاهدة جميع المندوبين', group: 'المندوبون' },
  { key: 'employees.view_team', label: 'مشاهدة مندوبي الفريق', group: 'المندوبون' },
  { key: 'employees.view_self', label: 'مشاهدة الملف الشخصي للمندوب', group: 'المندوبون' },
  { key: 'employees.create', label: 'إضافة مندوب جديد', group: 'المندوبون' },
  { key: 'employees.edit', label: 'تعديل بيانات المندوبين', group: 'المندوبون' },
  { key: 'employees.delete', label: 'حذف سجل مندوب', group: 'المندوبون' },

  { key: 'shifts.view_all', label: 'مشاهدة جميع الشفتات', group: 'الشفتات' },
  { key: 'shifts.view_team', label: 'مشاهدة شفتات الفريق', group: 'الشفتات' },
  { key: 'shifts.view_self', label: 'مشاهدة الشفتات الشخصية', group: 'الشفتات' },
  { key: 'shifts.edit', label: 'تعديل الشفتات', group: 'الشفتات' },
  { key: 'shifts.approve', label: 'اعتماد تعديلات الشفتات', group: 'الشفتات' },

  { key: 'attendance.view_all', label: 'متابعة حضور جميع الفرق', group: 'الحضور والانصراف' },
  { key: 'attendance.view_team', label: 'متابعة حضور الفريق', group: 'الحضور والانصراف' },
  { key: 'attendance.view_self', label: 'مشاهدة سجل الحضور الشخصي', group: 'الحضور والانصراف' },
  { key: 'attendance.record', label: 'تسجيل الحضور والغياب اليومي', group: 'الحضور والانصراف' },
  { key: 'attendance.edit', label: 'تعديل سجلات الحضور والانصراف', group: 'الحضور والانصراف' },
  { key: 'attendance.approve_correction', label: 'اعتماد طلبات تصحيح الحضور', group: 'الحضور والانصراف' },

  { key: 'leave.request', label: 'تقديم طلب إجازة أو تصحيح', group: 'الإجازات والطلبات' },
  { key: 'leave.review', label: 'مراجعة الطلبات ورفع توصية', group: 'الإجازات والطلبات' },
  { key: 'leave.approve', label: 'اعتماد أو رفض الإجازات والطلبات', group: 'الإجازات والطلبات' },

  { key: 'reports.view_all', label: 'مشاهدة جميع التقارير والإحصاءات', group: 'التقارير' },
  { key: 'reports.view_team', label: 'مشاهدة تقارير الفريق فقط', group: 'التقارير' },
  { key: 'reports.view_self', label: 'مشاهدة ملخص الأداء الشخصي', group: 'التقارير' },
  { key: 'reports.export', label: 'تصدير التقارير (Excel / CSV)', group: 'التقارير' },

  { key: 'teams.manage', label: 'إدارة الفرق وتعيين المشرفين', group: 'الإدارة والأمان' },
  { key: 'settings.manage', label: 'إدارة إعدادات الأمان والنظام', group: 'الإدارة والأمان' },
  { key: 'integration.manage', label: 'إدارة إعدادات الربط الخارجي', group: 'الإدارة والأمان' },
  { key: 'audit.view', label: 'الاطلاع على سجل العمليات الأمنية', group: 'الإدارة والأمان' },
  { key: 'audit.export', label: 'تصدير سجل العمليات الأمنية', group: 'الإدارة والأمان' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  super_admin: ALL_PERMISSIONS.map((p) => p.key),
  operations_manager: [
    'users.view',
    'employees.view_all',
    'employees.create',
    'employees.edit',
    'shifts.view_all',
    'shifts.edit',
    'shifts.approve',
    'attendance.view_all',
    'attendance.record',
    'attendance.edit',
    'attendance.approve_correction',
    'leave.review',
    'leave.approve',
    'reports.view_all',
    'reports.export',
    'audit.view',
  ],
  supervisor: [
    'employees.view_team',
    'shifts.view_team',
    'attendance.view_team',
    'attendance.record',
    'leave.request',
    'leave.review',
    'reports.view_team',
  ],
  delivery_rep: [
    'employees.view_self',
    'shifts.view_self',
    'attendance.view_self',
    'leave.request',
    'reports.view_self',
  ],
  viewer: [
    'employees.view_all',
    'shifts.view_all',
    'attendance.view_all',
    'reports.view_all',
  ],
};

const SUPER_ADMIN_EXCLUSIVE_PERMISSIONS: Set<PermissionKey> = new Set([
  'users.create',
  'users.disable',
  'users.assign_role',
  'settings.manage',
  'employees.delete',
]);

const READ_ONLY_OR_REP_BLOCKED_PERMISSIONS: Set<PermissionKey> = new Set([
  'users.create',
  'users.edit',
  'users.disable',
  'users.assign_role',
  'employees.create',
  'employees.edit',
  'employees.delete',
  'shifts.edit',
  'shifts.approve',
  'attendance.record',
  'attendance.edit',
  'attendance.approve_correction',
  'leave.review',
  'leave.approve',
  'teams.manage',
  'settings.manage',
  'integration.manage',
]);

export const DEFAULT_SECURITY_POLICY: SecurityPolicySettings = {
  policyId: 'global',
  allowSupervisorLeaveRecommendation: true,
  allowViewerExport: true,
  allowOpsIntegrationSync: false,
  enforceAdminMfaNotice: true,
  emergencyReadOnlyMode: false,
  systemLockdownMode: false,
  lockdownMessage: 'النظام في وضع الصيانة الأمنية المؤقتة بأمر من مدير النظام. يرجى المحاولة لاحقاً.',
  autoProvisionWithoutInvite: true,
  autoProvisionDefaultRole: 'delivery_rep',
  autoProvisionDefaultStatus: 'active',
  opsGrantedPerms: [],
  opsRevokedPerms: [],
  supGrantedPerms: [],
  supRevokedPerms: [],
  repGrantedPerms: [],
  repRevokedPerms: [],
  viewerGrantedPerms: [],
  viewerRevokedPerms: [],
  sessionTimeoutMinutes: 60,
  externalSyncEndpoint: '',
  lastExternalSyncStatus: 'جاهز للمزامنة الآمنة',
  lastExternalSyncImported: 0,
  lastExternalSyncFailed: 0,
  lastExternalSyncTime: '—',
  updatedBy: 'system',
  updatedAt: new Date().toISOString(),
};

export function isPermissionCustomizableForRole(
  role: UserRole,
  perm: PermissionKey
): boolean {
  if (role === 'super_admin') return false;
  if (SUPER_ADMIN_EXCLUSIVE_PERMISSIONS.has(perm)) return false;
  if (
    (role === 'viewer' || role === 'delivery_rep') &&
    READ_ONLY_OR_REP_BLOCKED_PERMISSIONS.has(perm)
  ) {
    return false;
  }
  return true;
}

export function resolveEffectivePermissions(
  user: UserProfile | null,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): Set<PermissionKey> {
  if (!user || user.status !== 'active') {
    return new Set();
  }

  if (user.role === 'super_admin') {
    return new Set(DEFAULT_ROLE_PERMISSIONS.super_admin);
  }

  if (policy.systemLockdownMode) {
    return new Set();
  }

  const effective = new Set<PermissionKey>(DEFAULT_ROLE_PERMISSIONS[user.role] || []);

  if (user.role === 'supervisor' && !policy.allowSupervisorLeaveRecommendation) {
    effective.delete('leave.review');
  }
  if (user.role === 'viewer' && policy.allowViewerExport) {
    effective.add('reports.export');
  } else if (user.role === 'viewer' && !policy.allowViewerExport) {
    effective.delete('reports.export');
  }
  if (user.role === 'operations_manager' && policy.allowOpsIntegrationSync) {
    effective.add('integration.manage');
  }

  const roleGrantsMap: Record<Exclude<UserRole, 'super_admin'>, PermissionKey[]> = {
    operations_manager: policy.opsGrantedPerms || [],
    supervisor: policy.supGrantedPerms || [],
    delivery_rep: policy.repGrantedPerms || [],
    viewer: policy.viewerGrantedPerms || [],
  };
  const roleRevokesMap: Record<Exclude<UserRole, 'super_admin'>, PermissionKey[]> = {
    operations_manager: policy.opsRevokedPerms || [],
    supervisor: policy.supRevokedPerms || [],
    delivery_rep: policy.repRevokedPerms || [],
    viewer: policy.viewerRevokedPerms || [],
  };

  (roleGrantsMap[user.role] || []).forEach((p) => {
    if (!READ_ONLY_OR_REP_BLOCKED_PERMISSIONS.has(p)) {
      effective.add(p);
    }
  });

  (roleRevokesMap[user.role] || []).forEach((p) => effective.delete(p));

  (user.extraPermissions || []).forEach((p) => {
    if (!READ_ONLY_OR_REP_BLOCKED_PERMISSIONS.has(p)) {
      effective.add(p);
    }
  });

  (user.revokedPermissions || []).forEach((p) => effective.delete(p));

  return effective;
}

export function hasPermission(
  user: UserProfile | null,
  perm: PermissionKey,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): boolean {
  return resolveEffectivePermissions(user, policy).has(perm);
}

export function canViewEmployee(
  user: UserProfile | null,
  emp: Employee,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'super_admin') return true;
  if (hasPermission(user, 'employees.view_all', policy)) return true;
  if (hasPermission(user, 'employees.view_team', policy) && user.teamId && emp.teamId === user.teamId) {
    return true;
  }
  if (hasPermission(user, 'employees.view_self', policy) && (user.employeeId === emp.id || user.uid === emp.userId)) {
    return true;
  }
  return false;
}
