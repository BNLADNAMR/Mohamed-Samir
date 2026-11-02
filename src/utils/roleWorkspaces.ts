import {
  AppRoutePage,
  PermissionKey,
  SecurityPolicySettings,
  UserProfile,
  UserRole,
} from '../types';
import {
  canAccessRoute,
  DEFAULT_SECURITY_POLICY,
  hasPermission,
  resolveEffectivePermissions,
  ROLE_LABELS_AR,
  WRITE_ACTION_PERMISSIONS,
} from './rbac';

export interface RoleWorkspaceTab {
  id: string;
  route: AppRoutePage;
  labelAr: string;
  descriptionAr?: string;
  badgeType?: 'live_alerts' | 'pending_requests';
}

export interface RoleCapabilities {
  canCreateEmployee: boolean;
  canEditEmployee: boolean;
  canDeleteEmployee: boolean;
  canRecordOrEditAnyAttendance: boolean;
  canDeleteAttendance: boolean;
  canEditShiftSelection: boolean;
  canUseSimulationLab: boolean;
  canManageIntegrationSync: boolean;
  canExportReports: boolean;
  canPrintReports: boolean;
  canSubmitRequests: boolean;
  canReviewRequests: boolean;
  canApproveRequests: boolean;
  canManageTeams: boolean;
  canViewAllTeams: boolean;
  canViewUsers: boolean;
  canManageUsers: boolean;
  canViewAuditLogs: boolean;
  canExportAuditLogs: boolean;
  canManageSecurityPolicy: boolean;
  canShareOwnLiveTelemetry: boolean;
}

export interface RoleWorkspaceConfig {
  role: UserRole;
  roleLabelAr: string;
  workspaceTitleAr: string;
  workspaceSubtitleAr: string;
  scopeBadgeAr: string;
  overviewPageTitleAr: string;
  overviewPageSubtitleAr: string;
  liveMapTitleAr: string;
  liveMapSubtitleAr: string;
  monthlyGridTitleAr: string;
  requestsTitleAr: string;
  requestsSubtitleAr: string;
  isReadOnlyWorkspace: boolean;
  isSingleTeamScoped: boolean;
  activePermissionsCount: number;
  primaryNavTabs: RoleWorkspaceTab[];
  capabilities: RoleCapabilities;
}

export interface RoleWorkspaceContext {
  teamName?: string;
  employeeName?: string;
  employeeCode?: string;
}

/**
 * محرك تخصيص الواجهات حسب الدور والصلاحيات الفعلية (Role-Dedicated Workspace Engine):
 * يولّد لكل دور واجهة واضحة ومباشرة تضم فقط الصفحات والأدوات المصرح بها في resolveEffectivePermissions،
 * مع ضمان عدم إظهار أي إعداد أو خيار يخص دوراً آخر.
 */
export function buildRoleWorkspaceConfig(
  user: UserProfile,
  policy: SecurityPolicySettings = DEFAULT_SECURITY_POLICY,
  context: RoleWorkspaceContext = {}
): RoleWorkspaceConfig {
  const effective = resolveEffectivePermissions(user, policy);
  const check = (perm: PermissionKey) => effective.has(perm);

  const hasAnyWritePerm = Array.from(WRITE_ACTION_PERMISSIONS).some((p) =>
    effective.has(p)
  );

  const canViewAllTeams =
    user.role === 'super_admin' ||
    check('employees.view_all') ||
    check('shifts.view_all') ||
    check('attendance.view_all');

  const isSingleTeamScoped =
    !canViewAllTeams &&
    (check('employees.view_team') ||
      check('shifts.view_team') ||
      check('attendance.view_team') ||
      check('reports.view_team'));

  const capabilities: RoleCapabilities = {
    canCreateEmployee: check('employees.create'),
    canEditEmployee: check('employees.edit'),
    canDeleteEmployee: check('employees.delete'),
    canRecordOrEditAnyAttendance: check('attendance.record') || check('attendance.edit'),
    canDeleteAttendance:
      user.role === 'super_admin' ||
      (user.role === 'operations_manager' && check('attendance.edit')),
    canEditShiftSelection: check('shifts.edit'),
    // معمل محاكاة واختبار السيستم متاح فقط لمدير النظام أو مدير التشغيل الفعال (مخفي تماماً عن المراقب والمشرف والمندوب)
    canUseSimulationLab:
      user.role === 'super_admin' ||
      (user.role === 'operations_manager' && check('attendance.edit')),
    canManageIntegrationSync: check('integration.manage'),
    canExportReports: check('reports.export'),
    canPrintReports:
      check('reports.export') ||
      (user.role !== 'delivery_rep' &&
        user.role !== 'viewer' &&
        (check('reports.view_all') || check('reports.view_team'))),
    canSubmitRequests: check('leave.request'),
    canReviewRequests: check('leave.review'),
    canApproveRequests: check('leave.approve'),
    canManageTeams: check('teams.manage'),
    canViewAllTeams,
    canViewUsers: check('users.view'),
    canManageUsers: user.role === 'super_admin' && check('users.create'),
    canViewAuditLogs: check('audit.view'),
    canExportAuditLogs: check('audit.export'),
    canManageSecurityPolicy: user.role === 'super_admin' && check('settings.manage'),
    canShareOwnLiveTelemetry:
      user.role === 'delivery_rep' &&
      user.status === 'active' &&
      !policy.emergencyReadOnlyMode &&
      !policy.systemLockdownMode,
  };

  const isReadOnlyWorkspace =
    user.role === 'viewer' ||
    (user.role !== 'super_admin' && policy.emergencyReadOnlyMode) ||
    (!hasAnyWritePerm && !capabilities.canShareOwnLiveTelemetry);

  const teamLabel = context.teamName?.trim() || user.teamId?.trim() || 'غير معيّن بعد';
  const repLabel = context.employeeCode
    ? `${context.employeeName || user.name} (${context.employeeCode})`
    : context.employeeName || user.name;

  // 1. نصوص وهوية الواجهة المخصصة لكل دور بدقة ووضوح
  let workspaceTitleAr = '';
  let workspaceSubtitleAr = '';
  let scopeBadgeAr = '';
  let overviewPageTitleAr = '';
  let overviewPageSubtitleAr = '';
  let liveMapTitleAr = '';
  let liveMapSubtitleAr = '';
  let monthlyGridTitleAr = '';
  let requestsTitleAr = '';
  let requestsSubtitleAr = '';

  switch (user.role) {
    case 'super_admin':
      workspaceTitleAr = 'واجهة مدير النظام الشاملة';
      workspaceSubtitleAr =
        'إدارة كاملة للتشغيل الميداني، الخريطة الحية، الحوكمة الأمنية، مصفوفة الصلاحيات، والربط السحابي.';
      scopeBadgeAr = 'نطاق النظام الكامل · جميع الصلاحيات';
      overviewPageTitleAr = 'نظرة عامة تنفيذية على النظام والتشغيل';
      overviewPageSubtitleAr =
        'مؤشرات الأسطول، التزام الشفتات، الخريطة المباشرة، وحالة الحوكمة في شاشة موحدة';
      liveMapTitleAr = 'المراقبة الحية الشاملة لجميع المناديب والتنبيهات';
      liveMapSubtitleAr =
        'تتبع لحظي لمواقع GPS والمحافظ والباتشات عبر كافة الفرق مع أدوات الاختبار والتحديث';
      monthlyGridTitleAr = 'الجدول الشهري الشامل للشفتات والحضور';
      requestsTitleAr = 'إدارة واعتماد جميع الطلبات والإجازات';
      requestsSubtitleAr =
        'مراجعة واعتماد طلبات الإجازات وتصحيحات الحضور لكافة الفرق والمشرفين.';
      break;

    case 'operations_manager':
      workspaceTitleAr = 'واجهة مدير التشغيل والأسطول';
      workspaceSubtitleAr =
        'متابعة جميع الفرق والمندوبين، تعديل الجداول والحضور، واعتماد طلبات الإجازات والتصحيحات.';
      scopeBadgeAr = policy.emergencyReadOnlyMode
        ? 'نطاق التشغيل العام · وضع القراءة المؤقت'
        : 'نطاق التشغيل العام · جميع الفرق';
      overviewPageTitleAr = 'ملخص الأداء التشغيلي العام للأسطول';
      overviewPageSubtitleAr =
        'متابعة ساعات التشغيل، انضباط الشفتات، الخريطة المباشرة، واعتماد الطلبات عبر كافة الفرق';
      liveMapTitleAr = 'خريطة متابعة الأسطول والتنبيهات التشغيلية';
      liveMapSubtitleAr =
        'مراقبة مواقع المناديب على رأس العمل، تنبيهات الأداء والمحافظ، وتحديث بيانات التشغيل';
      monthlyGridTitleAr = 'جدول الشفتات والحضور لجميع الفرق';
      requestsTitleAr = 'اعتماد طلبات الإجازات وتصحيح الحضور';
      requestsSubtitleAr =
        'مراجعة توصيات المشرفين واعتماد أو رفض طلبات المندوبين (يُمنع الاعتماد الذاتي).';
      break;

    case 'supervisor':
      workspaceTitleAr = `واجهة إشراف الفريق الميداني`;
      workspaceSubtitleAr =
        'متابعة حية ومفصلة لأعضاء فريقك فقط، تسجيل الحضور اليومي والملاحظات، ومراجعة طلبات الفريق.';
      scopeBadgeAr = `نطاق فريقي فقط: ${teamLabel}`;
      overviewPageTitleAr = `ملخص أداء وشفتات فريقي (${teamLabel})`;
      overviewPageSubtitleAr =
        'مؤشرات حضور وساعات والتزام مندوبي فريقك المعيّن لك فقط دون بيانات الفرق الأخرى';
      liveMapTitleAr = `الخريطة المباشرة لمندوبي فريقي (${teamLabel})`;
      liveMapSubtitleAr =
        'متابعة مواقع مندوبي فريقك، المحافظ النقدية، والتنبيهات الفورية الخاصة بالفريق';
      monthlyGridTitleAr = `جدول حضور وشفتات فريقي (${teamLabel})`;
      requestsTitleAr = `طلبات إجازات وتصحيحات فريقي (${teamLabel})`;
      requestsSubtitleAr =
        'تقديم توصيتك الإشرافية على طلبات أعضاء فريقك أو رفع طلب تصحيح لمدير التشغيل.';
      break;

    case 'delivery_rep':
      workspaceTitleAr = 'البوابة الشخصية للمندوب';
      workspaceSubtitleAr =
        'متابعة شفتاتك اليومية، ساعات عملك، مشاركة موقعك ومحفظتك أثناء العمل، وتقديم طلباتك الشخصية.';
      scopeBadgeAr = `بياناتي الشخصية فقط · ${repLabel}`;
      overviewPageTitleAr = 'ملخص أدائي الشخصي';
      overviewPageSubtitleAr = 'بيانات حضورك وشفتاتك الشخصية المسجلة';
      liveMapTitleAr = 'موقعي المباشر';
      liveMapSubtitleAr = 'مشاركة موقع العمل والمحفظة';
      monthlyGridTitleAr = 'جدولي الشهري الشخصي';
      requestsTitleAr = 'طلباتي الشخصية (الإجازات وتصحيح الحضور)';
      requestsSubtitleAr =
        'تقديم طلب إجازة أو يوم راحة أو تصحيح وقت شفت ومتابعة حالة اعتماده من الإدارة.';
      break;

    case 'viewer':
    default:
      workspaceTitleAr = 'واجهة المراقبة والتقارير (قراءة فقط)';
      workspaceSubtitleAr =
        'استعراض المؤشرات التنفيذية والخريطة الحية والجداول والتقارير التحليلية دون أي أدوات تعديل.';
      scopeBadgeAr = capabilities.canExportReports
        ? 'قراءة وتصدير فقط · بدون صلاحيات تعديل'
        : 'قراءة فقط · بدون تعديل أو تصدير';
      overviewPageTitleAr = 'لوحة استعراض الأداء العام (قراءة فقط)';
      overviewPageSubtitleAr =
        'عرض تحليلي شامل لساعات التشغيل ومعدلات الالتزام والخريطة الحية دون تعديل السجلات';
      liveMapTitleAr = 'استعراض الخريطة الحية للمناديب (قراءة فقط)';
      liveMapSubtitleAr =
        'عرض مباشر لمواقع المناديب وحالات التنبيهات والأداء المسجل بالنظام للرصد والمتابعة';
      monthlyGridTitleAr = 'استعراض الجدول الشهري للشفتات (قراءة فقط)';
      requestsTitleAr = 'استعراض الطلبات';
      requestsSubtitleAr = 'عرض حالة الطلبات المسجلة.';
      break;
  }

  // 2. بناء شريط التبويبات المخصص للدور بناءً على الصلاحيات الفعلية فقط (بدون أي عنصر غير مصرح به)
  const candidateTabs: Array<{
    id: string;
    route: AppRoutePage;
    labelByRole: Partial<Record<UserRole, string>> & { default: string };
    badgeType?: 'live_alerts' | 'pending_requests';
    when?: () => boolean;
  }> = [
    {
      id: 'tab_my_portal',
      route: 'my_portal',
      labelByRole: {
        delivery_rep: 'شفتاتي وحضوري اليومي',
        default: 'بوابتي الشخصية',
      },
      when: () =>
        user.role === 'delivery_rep' && canAccessRoute(user, 'my_portal', policy),
    },
    {
      id: 'tab_dashboard',
      route: 'dashboard',
      labelByRole: {
        super_admin: 'الرئيسية التنفيذية',
        operations_manager: 'ملخص التشغيل',
        supervisor: 'ملخص فريقي',
        viewer: 'الملخص العام',
        default: 'الرئيسية',
      },
      when: () => canAccessRoute(user, 'dashboard', policy),
    },
    {
      id: 'tab_live_monitoring',
      route: 'live_monitoring',
      labelByRole: {
        super_admin: 'الخريطة الحية والتنبيهات',
        operations_manager: 'خريطة الأسطول الحية',
        supervisor: 'خريطة فريقي الحية',
        viewer: 'الخريطة الحية (عرض)',
        default: 'المراقبة الحية',
      },
      badgeType: 'live_alerts',
      when: () => canAccessRoute(user, 'live_monitoring', policy),
    },
    {
      id: 'tab_monthly_grid',
      route: 'monthly_grid',
      labelByRole: {
        super_admin: 'الجدول الشهري',
        operations_manager: 'جدول الشفتات والحضور',
        supervisor: 'حضور وشفتات فريقي',
        viewer: 'الجدول الشهري (عرض)',
        default: 'الجدول الشهري',
      },
      when: () => canAccessRoute(user, 'monthly_grid', policy),
    },
    {
      id: 'tab_analytics',
      route: 'analytics',
      labelByRole: {
        super_admin: 'التقارير التحليلية',
        operations_manager: 'تقارير الأداء',
        supervisor: 'تقارير التزام فريقي',
        viewer: 'التقارير التحليلية',
        default: 'التقارير',
      },
      when: () => canAccessRoute(user, 'analytics', policy),
    },
    {
      id: 'tab_requests',
      route: 'requests',
      labelByRole: {
        super_admin: 'الطلبات والاعتمادات',
        operations_manager: 'اعتماد الطلبات',
        supervisor: 'طلبات وتوصيات فريقي',
        delivery_rep: 'طلباتي وإجازاتي',
        default: 'الطلبات',
      },
      badgeType: 'pending_requests',
      when: () => canAccessRoute(user, 'requests', policy),
    },
    {
      id: 'tab_teams',
      route: 'teams',
      labelByRole: {
        operations_manager: capabilities.canManageTeams ? 'إدارة الفرق' : 'فرق المندوبين',
        supervisor: 'بيانات فريقي',
        default: 'الفرق',
      },
      // لمدير النظام تُدار الفرق من داخل مركز الحوكمة والأمان لتجنب تكرار الإعدادات
      when: () =>
        user.role !== 'super_admin' && canAccessRoute(user, 'teams', policy),
    },
    {
      id: 'tab_users',
      route: 'users',
      labelByRole: {
        operations_manager: 'دليل الحسابات (عرض)',
        default: 'المستخدمون',
      },
      when: () =>
        user.role !== 'super_admin' &&
        hasPermission(user, 'users.view', policy) &&
        canAccessRoute(user, 'users', policy),
    },
    {
      id: 'tab_audit_logs',
      route: 'audit_logs',
      labelByRole: {
        operations_manager: 'سجل العمليات',
        default: 'سجل المراجعة',
      },
      when: () =>
        user.role !== 'super_admin' &&
        hasPermission(user, 'audit.view', policy) &&
        canAccessRoute(user, 'audit_logs', policy),
    },
    {
      id: 'tab_security_center',
      route: 'security_center',
      labelByRole: {
        super_admin: 'مركز الحوكمة والصلاحيات',
        default: 'مركز الأمان',
      },
      when: () =>
        user.role === 'super_admin' &&
        canAccessRoute(user, 'security_center', policy),
    },
    {
      id: 'tab_profile',
      route: 'profile',
      labelByRole: {
        delivery_rep: 'حسابي وإعداداتي',
        default: 'ملفي الشخصي',
      },
      when: () => canAccessRoute(user, 'profile', policy),
    },
  ];

  const primaryNavTabs: RoleWorkspaceTab[] = candidateTabs
    .filter((item) => (item.when ? item.when() : true))
    .map((item) => {
      const labelAr = item.labelByRole[user.role] || item.labelByRole.default;
      return {
        id: item.id,
        route: item.route,
        labelAr,
        descriptionAr: labelAr,
        badgeType: item.badgeType,
      };
    });

  return {
    role: user.role,
    roleLabelAr: ROLE_LABELS_AR[user.role],
    workspaceTitleAr,
    workspaceSubtitleAr,
    scopeBadgeAr,
    overviewPageTitleAr,
    overviewPageSubtitleAr,
    liveMapTitleAr,
    liveMapSubtitleAr,
    monthlyGridTitleAr,
    requestsTitleAr,
    requestsSubtitleAr,
    isReadOnlyWorkspace,
    isSingleTeamScoped,
    activePermissionsCount: effective.size,
    primaryNavTabs,
    capabilities,
  };
}
