import {
  AppRoutePage,
  ProfileSectionId,
  SecurityPolicySettings,
  UserProfile,
} from '../types';
import { ShiftCasePageType } from '../components/ShiftCaseDetailPage';
import { SecurityHubTab } from '../components/SuperAdminSecurityHub';
import { NavigationSnapshot } from './navigationHistory';
import { canAccessRoute, hasPermission } from './rbac';

export type DrawerQuickActionId =
  | 'open_add_employee'
  | 'open_sync_modal'
  | 'export_csv'
  | 'print_page'
  | 'toggle_theme'
  | 'logout';

export type DrawerSectionGroupId =
  | 'operations'
  | 'shift_cases'
  | 'administration_security'
  | 'profile_security'
  | 'quick_tools';

export type DrawerIconKey =
  | 'home_overview'
  | 'live_map'
  | 'calendar_grid'
  | 'analytics'
  | 'my_portal'
  | 'requests'
  | 'case_all'
  | 'case_missed'
  | 'case_incomplete'
  | 'case_worked'
  | 'case_absent'
  | 'sec_overview'
  | 'sec_matrix'
  | 'users'
  | 'teams'
  | 'integration'
  | 'audit'
  | 'sec_settings'
  | 'profile_all'
  | 'profile_personal'
  | 'profile_password'
  | 'profile_security'
  | 'profile_activity'
  | 'tool_add_emp'
  | 'tool_sync'
  | 'tool_export'
  | 'tool_print'
  | 'tool_theme'
  | 'tool_logout';

export interface DrawerSectionItem {
  id: string;
  groupId: DrawerSectionGroupId;
  titleAr: string;
  subtitleAr: string;
  iconKey: DrawerIconKey;
  kind: 'navigation' | 'action';
  targetSnapshot?: Partial<NavigationSnapshot> & { route: AppRoutePage };
  actionId?: DrawerQuickActionId;
  count?: number;
  alertLabelAr?: string;
  tone?: 'default' | 'danger' | 'warning';
}

export interface DrawerSectionGroup {
  id: DrawerSectionGroupId;
  titleAr: string;
  descriptionAr: string;
  items: DrawerSectionItem[];
}

export interface DrawerCountsInput {
  employeesCount: number;
  liveAlertsCount?: number;
  pendingRequestsCount: number;
  usersCount: number;
  teamsCount: number;
  auditLogsCount: number;
  isDarkMode: boolean;
}

/**
 * بناء دليل شامل ومبسط لجميع أقسام النظام بلا استثناء،
 * مع مراعاة صلاحيات الدور الفعلي (RBAC) وسياسة الطوارئ النشطة.
 */
export function buildDrawerSectionGroups(params: {
  user: UserProfile;
  policy: SecurityPolicySettings;
  counts: DrawerCountsInput;
}): DrawerSectionGroup[] {
  const { user, policy, counts } = params;
  const groups: DrawerSectionGroup[] = [];

  // =========================================================================
  // 1. مجموعة التشغيل والجدول والمتابعة اليومية
  // =========================================================================
  const operationsItems: DrawerSectionItem[] = [];

  if (canAccessRoute(user, 'dashboard', policy)) {
    operationsItems.push({
      id: 'nav_home_overview',
      groupId: 'operations',
      titleAr:
        user.role === 'supervisor'
          ? 'ملخص أداء وشفتات فريقي'
          : user.role === 'viewer'
          ? 'الملخص العام للأداء (قراءة فقط)'
          : 'الصفحة الرئيسية · ملخص البيانات العام',
      subtitleAr:
        user.role === 'supervisor'
          ? 'مؤشرات الحضور والساعات والخريطة الحية لأعضاء فريقك فقط'
          : user.role === 'viewer'
          ? 'استعراض المؤشرات التنفيذية والخريطة الحية دون أدوات تعديل'
          : 'لوحة المؤشرات التفاعلية والرسوم التحليلية مع انتقال فوري للتفاصيل',
      iconKey: 'home_overview',
      kind: 'navigation',
      targetSnapshot: {
        route: 'dashboard',
        viewTab: 'grid',
        casePage: null,
      },
    });
  }

  if (canAccessRoute(user, 'live_monitoring', policy)) {
    const activeAlerts = counts.liveAlertsCount ?? 0;
    operationsItems.push({
      id: 'nav_live_monitoring',
      groupId: 'operations',
      titleAr:
        user.role === 'supervisor'
          ? 'الخريطة المباشرة لمندوبي فريقي'
          : user.role === 'viewer'
          ? 'الخريطة الحية للمناديب (قراءة فقط)'
          : 'المراقبة الحية للمناديب والتنبيهات الذكية (Live Map)',
      subtitleAr:
        user.role === 'supervisor'
          ? 'متابعة مواقع مندوبي فريقك والمحافظ والتنبيهات الفورية'
          : user.role === 'viewer'
          ? 'عرض مباشر لمواقع المناديب وحالات التنبيهات المسجلة بالنظام'
          : 'خريطة GPS مباشرة للمواقع والمحافظ والباتشات وترتيب الأولوية والتنبيهات',
      iconKey: 'live_map',
      kind: 'navigation',
      targetSnapshot: {
        route: 'live_monitoring',
        viewTab: 'grid',
        casePage: null,
      },
      count: activeAlerts > 0 ? activeAlerts : counts.employeesCount,
      alertLabelAr: activeAlerts > 0 ? 'تنبيه نشط' : undefined,
      tone: activeAlerts > 0 ? 'warning' : 'default',
    });
  }

  if (canAccessRoute(user, 'monthly_grid', policy)) {
    operationsItems.push({
      id: 'nav_dashboard_grid',
      groupId: 'operations',
      titleAr:
        user.role === 'supervisor'
          ? 'جدول حضور وشفتات فريقي'
          : user.role === 'viewer'
          ? 'الجدول الشهري للشفتات (قراءة فقط)'
          : 'الجدول الشهري العام للشفتات',
      subtitleAr:
        user.role === 'supervisor'
          ? 'تسجيل الحضور اليومي والملاحظات الإشرافية لأعضاء فريقك'
          : user.role === 'viewer'
          ? 'استعراض سجلات الحضور والشفتات الشهرية بدون تعديل'
          : 'صفحة مستقلة لمتابعة حضور وانصراف وشفتات المندوبين يومياً',
      iconKey: 'calendar_grid',
      kind: 'navigation',
      targetSnapshot: {
        route: 'monthly_grid',
        viewTab: 'grid',
        casePage: null,
      },
      count: counts.employeesCount,
    });
  }

  if (canAccessRoute(user, 'analytics', policy)) {
    operationsItems.push({
      id: 'nav_dashboard_analytics',
      groupId: 'operations',
      titleAr:
        user.role === 'supervisor'
          ? 'تقارير التزام وأداء فريقي'
          : 'ملخص الأداء والتقارير التحليلية',
      subtitleAr:
        user.role === 'supervisor'
          ? 'مؤشرات الالتزام وإجمالي الساعات وترتيب أداء أعضاء فريقك'
          : 'صفحة مستقلة لمؤشرات الالتزام وإجمالي الساعات وترتيب الأداء الشهري',
      iconKey: 'analytics',
      kind: 'navigation',
      targetSnapshot: {
        route: 'analytics',
        viewTab: 'grid',
        casePage: null,
      },
    });
  }

  if (canAccessRoute(user, 'my_portal', policy)) {
    operationsItems.push({
      id: 'nav_my_portal',
      groupId: 'operations',
      titleAr: 'بوابتي الشخصية للشفتات والحضور',
      subtitleAr: 'عرض جدولي الشخصي، ساعات العمل، ومشاركة موقعي المباشر',
      iconKey: 'my_portal',
      kind: 'navigation',
      targetSnapshot: {
        route: 'my_portal',
        viewTab: 'grid',
        casePage: null,
      },
    });
  }

  if (canAccessRoute(user, 'requests', policy)) {
    operationsItems.push({
      id: 'nav_requests',
      groupId: 'operations',
      titleAr:
        user.role === 'delivery_rep'
          ? 'طلباتي الشخصية (الإجازات والتصحيحات)'
          : user.role === 'supervisor'
          ? 'طلبات وتوصيات أعضاء فريقي'
          : 'الطلبات والإجازات وتصحيح الحضور',
      subtitleAr:
        user.role === 'delivery_rep'
          ? 'تقديم طلب إجازة أو تصحيح شفت ومتابعة حالة اعتماده'
          : user.role === 'supervisor'
          ? 'مراجعة طلبات فريقك وإضافة توصيتك الإشرافية لمدير التشغيل'
          : 'إرسال ومراجعة واعتماد طلبات الإجازات والاعتراضات',
      iconKey: 'requests',
      kind: 'navigation',
      targetSnapshot: {
        route: 'requests',
        viewTab: 'grid',
        casePage: null,
      },
      count:
        counts.pendingRequestsCount > 0 ? counts.pendingRequestsCount : undefined,
      tone: counts.pendingRequestsCount > 0 ? 'warning' : 'default',
    });
  }

  if (operationsItems.length > 0) {
    groups.push({
      id: 'operations',
      titleAr:
        user.role === 'delivery_rep'
          ? 'بوابتك الشخصية والطلبات'
          : user.role === 'supervisor'
          ? 'متابعة وإشراف فريقي الميداني'
          : user.role === 'viewer'
          ? 'شاشات المراقبة والتقارير (قراءة فقط)'
          : 'التشغيل والجدول والمتابعة',
      descriptionAr:
        user.role === 'delivery_rep'
          ? 'شفتاتك اليومية، ساعات عملك، وطلباتك الشخصية فقط'
          : user.role === 'supervisor'
          ? 'الصفحات المخصصة لإشراف ومتابعة أعضاء فريقك فقط'
          : user.role === 'viewer'
          ? 'استعراض البيانات والمؤشرات المصرح بها دون تعديل'
          : 'الصفحات الأساسية لإدارة الشفتات والتقارير والطلبات',
      items: operationsItems,
    });
  }

  // =========================================================================
  // 2. مجموعة صفحات تفصيل حالات الشفتات والحضور (جميع الـ 5 صفحات المخصصة)
  // =========================================================================
  if (canAccessRoute(user, 'dashboard', policy)) {
    const shiftCases: {
      caseType: ShiftCasePageType;
      titleAr: string;
      subtitleAr: string;
      iconKey: DrawerIconKey;
    }[] = [
      {
        caseType: 'all_shifts',
        titleAr: 'كل حالات الشفتات للشهر',
        subtitleAr: 'توزيع شامل لأيام اختيار الشفتات والحضور والغياب',
        iconKey: 'case_all',
      },
      {
        caseType: 'selected_not_worked',
        titleAr: 'اختار الشفت ولم يعمل',
        subtitleAr: 'المندوبون الذين حجزوا شفتاً في أيام منقضية دون حضور فعلي',
        iconKey: 'case_missed',
      },
      {
        caseType: 'incomplete_schedule',
        titleAr: 'لم يكمل جدولة الشهر',
        subtitleAr: 'المندوبون الذين لديهم أيام متبقية غير محددة الشفت',
        iconKey: 'case_incomplete',
      },
      {
        caseType: 'worked_only',
        titleAr: 'المندوبون الحاضرون فعلياً',
        subtitleAr: 'تفاصيل ساعات العمل الفعلية ومعدل الالتزام اليومي',
        iconKey: 'case_worked',
      },
      {
        caseType: 'absent_only',
        titleAr: 'سجل حالات الغياب المسجلة',
        subtitleAr: 'قائمة الغياب مع التواريخ وملاحظات المشرفين للمتابعة',
        iconKey: 'case_absent',
      },
    ];

    groups.push({
      id: 'shift_cases',
      titleAr: 'صفحات حالات الشفتات التفصيلية',
      descriptionAr: 'فرز متخصص لكل حالة تشغيلية بصفحة مستقلة ومبسطة',
      items: shiftCases.map((sc) => ({
        id: `nav_case_${sc.caseType}`,
        groupId: 'shift_cases',
        titleAr: sc.titleAr,
        subtitleAr: sc.subtitleAr,
        iconKey: sc.iconKey,
        kind: 'navigation',
        targetSnapshot: {
          route: 'dashboard',
          viewTab: 'grid',
          casePage: sc.caseType,
        },
      })),
    });
  }

  // =========================================================================
  // 3. مجموعة الإدارة والفرق والحوكمة الأمنية
  // =========================================================================
  const adminSecurityItems: DrawerSectionItem[] = [];

  if (user.role === 'super_admin' && canAccessRoute(user, 'security_center', policy)) {
    const emergencyActive =
      policy.systemLockdownMode || policy.emergencyReadOnlyMode;

    const hubTabs: {
      tab: SecurityHubTab;
      titleAr: string;
      subtitleAr: string;
      iconKey: DrawerIconKey;
      count?: number;
      alertLabelAr?: string;
      tone?: 'default' | 'danger' | 'warning';
    }[] = [
      {
        tab: 'overview',
        titleAr: 'غرفة القيادة والطوارئ الأمنية',
        subtitleAr: 'قفل النظام الشامل، تجميد التعديلات، وضبط الجلسات',
        iconKey: 'sec_overview',
        alertLabelAr: emergencyActive ? 'وضع طوارئ نشط' : undefined,
        tone: emergencyActive ? 'warning' : 'default',
      },
      {
        tab: 'permissions_matrix',
        titleAr: 'مصفوفة الصلاحيات التفاعلية (RBAC)',
        subtitleAr: 'تعديل صلاحيات الأدوار الخمسة وتعميمها فورياً',
        iconKey: 'sec_matrix',
      },
      {
        tab: 'users',
        titleAr: 'إدارة الحسابات والصلاحيات التلقائية',
        subtitleAr: 'تغيير الأدوار مباشرة دون دعوة، وتفعيل أو إيقاف الحسابات',
        iconKey: 'users',
        count: counts.usersCount,
      },
      {
        tab: 'teams',
        titleAr: 'إدارة الفرق ونطاق البيانات',
        subtitleAr: 'تعيين المشرفين وتوزيع المندوبين وعزل فرق العمل',
        iconKey: 'teams',
        count: counts.teamsCount,
      },
      {
        tab: 'integration',
        titleAr: 'الربط الخارجي والنسخ الاحتياطي',
        subtitleAr: 'إعداد نقطة المزامنة الخارجية واستعادة النسخ الاحتياطية',
        iconKey: 'integration',
      },
      {
        tab: 'audit_and_simulator',
        titleAr: 'السجل الأمني ومحاكي الصلاحيات',
        subtitleAr: 'مراجعة العمليات الحساسة ومعاينة صلاحيات أي مستخدم',
        iconKey: 'audit',
        count: counts.auditLogsCount > 0 ? counts.auditLogsCount : undefined,
      },
    ];

    hubTabs.forEach((hub) => {
      adminSecurityItems.push({
        id: `nav_sec_hub_${hub.tab}`,
        groupId: 'administration_security',
        titleAr: hub.titleAr,
        subtitleAr: hub.subtitleAr,
        iconKey: hub.iconKey,
        kind: 'navigation',
        targetSnapshot: {
          route: 'security_center',
          viewTab: 'grid',
          casePage: null,
          securityTab: hub.tab,
        },
        count: hub.count,
        alertLabelAr: hub.alertLabelAr,
        tone: hub.tone,
      });
    });
  } else {
    if (canAccessRoute(user, 'teams', policy)) {
      const canManageTeams = hasPermission(user, 'teams.manage', policy);
      adminSecurityItems.push({
        id: 'nav_teams',
        groupId: 'administration_security',
        titleAr:
          user.role === 'supervisor'
            ? 'بطاقة وبيانات فريقي'
            : canManageTeams
            ? 'إدارة الفرق والمشرفين'
            : 'فرق المندوبين (عرض)',
        subtitleAr:
          user.role === 'supervisor'
            ? 'عرض أعضاء فريقك المعيّن لك وحالتهم التشغيلية'
            : 'متابعة فرق التوصيل وتوزيع المشرفين والمندوبين',
        iconKey: 'teams',
        kind: 'navigation',
        targetSnapshot: {
          route: 'teams',
          viewTab: 'grid',
          casePage: null,
        },
        count: counts.teamsCount > 0 ? counts.teamsCount : undefined,
      });
    }

    if (canAccessRoute(user, 'users', policy)) {
      adminSecurityItems.push({
        id: 'nav_users',
        groupId: 'administration_security',
        titleAr: 'دليل المستخدمين والحسابات (عرض فقط)',
        subtitleAr: 'استعراض حسابات النظام والأدوار الوظيفية المعتمدة دون تعديل الصلاحيات',
        iconKey: 'users',
        kind: 'navigation',
        targetSnapshot: {
          route: 'users',
          viewTab: 'grid',
          casePage: null,
        },
        count: counts.usersCount > 0 ? counts.usersCount : undefined,
      });
    }

    if (canAccessRoute(user, 'audit_logs', policy)) {
      adminSecurityItems.push({
        id: 'nav_audit_logs',
        groupId: 'administration_security',
        titleAr: 'سجل العمليات والمراجعة',
        subtitleAr: 'متابعة التعديلات التشغيلية وسجل الإجراءات الموثقة',
        iconKey: 'audit',
        kind: 'navigation',
        targetSnapshot: {
          route: 'audit_logs',
          viewTab: 'grid',
          casePage: null,
        },
        count: counts.auditLogsCount > 0 ? counts.auditLogsCount : undefined,
      });
    }

    if (canAccessRoute(user, 'security_settings', policy)) {
      adminSecurityItems.push({
        id: 'nav_security_settings',
        groupId: 'administration_security',
        titleAr: 'إعدادات السياسة الأمنية',
        subtitleAr: 'ضبط إعدادات الجلسات وسياسات الحماية العامة',
        iconKey: 'sec_settings',
        kind: 'navigation',
        targetSnapshot: {
          route: 'security_settings',
          viewTab: 'grid',
          casePage: null,
        },
      });
    }
  }

  if (adminSecurityItems.length > 0) {
    groups.push({
      id: 'administration_security',
      titleAr:
        user.role === 'super_admin'
          ? 'مركز التحكم الأمني والإدارة الشاملة'
          : 'الإدارة والفرق والمراجعة',
      descriptionAr:
        user.role === 'super_admin'
          ? 'جميع أقسام الحوكمة، الصلاحيات، الحسابات، الفرق، والسجل الأمني'
          : 'الأقسام الإدارية والرقابية المصرح لحسابك الوصول إليها',
      items: adminSecurityItems,
    });
  }

  // =========================================================================
  // 4. مجموعة الملف الشخصي وإعدادات أمان الحساب (مرتبة 1–4 + عرض الكل)
  // =========================================================================
  if (canAccessRoute(user, 'profile', policy)) {
    const profileItems: {
      section: ProfileSectionId;
      titleAr: string;
      subtitleAr: string;
      iconKey: DrawerIconKey;
    }[] = [
      {
        section: 'all',
        titleAr: 'الملف الشخصي الكامل (جميع الأقسام 1–4)',
        subtitleAr: 'استعراض كافة إعدادات الحساب والأمان مرتبة في صفحة واحدة',
        iconKey: 'profile_all',
      },
      {
        section: 'personal_info',
        titleAr: '1. المعلومات الشخصية والبيانات الأساسية',
        subtitleAr: 'تعديل الاسم، رقم الهاتف، المسمى الوظيفي، والقسم يدوياً',
        iconKey: 'profile_personal',
      },
      {
        section: 'password_credentials',
        titleAr: '2. كلمة المرور وبيانات الدخول',
        subtitleAr: 'تغيير كلمة المرور يدوياً أو تعيين كلمة مرور وتأكيد البريد',
        iconKey: 'profile_password',
      },
      {
        section: 'security_procedures',
        titleAr: '3. إجراءات أمان الحساب وحماية الجلسة',
        subtitleAr: 'مهلة القفل التلقائي، حماية العمليات الحساسة، وتجديد الرمز',
        iconKey: 'profile_security',
      },
      {
        section: 'role_and_activity',
        titleAr: '4. الصلاحيات وسجل أمان الحساب',
        subtitleAr: 'عرض الدور الوظيفي والنطاق وسجل العمليات الأمنية الأخيرة',
        iconKey: 'profile_activity',
      },
    ];

    groups.push({
      id: 'profile_security',
      titleAr: 'الملف الشخصي وإجراءات أمان الحساب',
      descriptionAr: 'تحكم يدوي منظم في بياناتك الشخصية وكلمة المرور والجلسة',
      items: profileItems.map((p) => ({
        id: `nav_profile_${p.section}`,
        groupId: 'profile_security',
        titleAr: p.titleAr,
        subtitleAr: p.subtitleAr,
        iconKey: p.iconKey,
        kind: 'navigation',
        targetSnapshot: {
          route: 'profile',
          viewTab: 'grid',
          casePage: null,
          profileSection: p.section,
        },
      })),
    });
  }

  // =========================================================================
  // 5. مجموعة الأدوات السريعة وإجراءات الجلسة
  // =========================================================================
  const quickToolsItems: DrawerSectionItem[] = [];

  if (hasPermission(user, 'employees.create', policy)) {
    quickToolsItems.push({
      id: 'act_add_employee',
      groupId: 'quick_tools',
      titleAr: 'إضافة مندوب جديد',
      subtitleAr: 'تسجيل مندوب جديد وربطه بالفريق والكود الوظيفي مباشرة',
      iconKey: 'tool_add_emp',
      kind: 'action',
      actionId: 'open_add_employee',
    });
  }

  const canExport = hasPermission(user, 'reports.export', policy);
  const canManageIntegration = hasPermission(user, 'integration.manage', policy);
  const canPrint =
    canExport ||
    (user.role !== 'delivery_rep' &&
      user.role !== 'viewer' &&
      (hasPermission(user, 'reports.view_all', policy) ||
        hasPermission(user, 'reports.view_team', policy)));

  if (canManageIntegration) {
    quickToolsItems.push({
      id: 'act_sync_json',
      groupId: 'quick_tools',
      titleAr: 'مزامنة البيانات واستيراد / تصدير JSON',
      subtitleAr: 'استيراد بيانات الشفتات أو أخذ نسخة احتياطية منظمة',
      iconKey: 'tool_sync',
      kind: 'action',
      actionId: 'open_sync_modal',
    });
  }

  if (canExport) {
    quickToolsItems.push({
      id: 'act_export_csv',
      groupId: 'quick_tools',
      titleAr: 'تصدير تقرير الشهر (Excel / CSV)',
      subtitleAr: 'تنزيل جدول الشفتات وساعات العمل بصيغة متوافقة مع Excel',
      iconKey: 'tool_export',
      kind: 'action',
      actionId: 'export_csv',
    });
  }

  if (canPrint) {
    quickToolsItems.push({
      id: 'act_print',
      groupId: 'quick_tools',
      titleAr: 'طباعة العرض الحالي',
      subtitleAr: 'تجهيز الصفحة الحالية للطباعة الفورية بتنسيق نظيف',
      iconKey: 'tool_print',
      kind: 'action',
      actionId: 'print_page',
    });
  }

  quickToolsItems.push({
    id: 'act_toggle_theme',
    groupId: 'quick_tools',
    titleAr: counts.isDarkMode
      ? 'التبديل إلى الوضع الفاتح'
      : 'التبديل إلى الوضع الداكن',
    subtitleAr: 'تغيير مظهر الواجهة مع حفظ تفضيلك تلقائياً',
    iconKey: 'tool_theme',
    kind: 'action',
    actionId: 'toggle_theme',
  });

  quickToolsItems.push({
    id: 'act_logout',
    groupId: 'quick_tools',
    titleAr: 'تسجيل الخروج الآمن',
    subtitleAr: 'إنهاء الجلسة الحالية وإغلاق الوصول للحساب بأمان',
    iconKey: 'tool_logout',
    kind: 'action',
    actionId: 'logout',
    tone: 'danger',
  });

  groups.push({
    id: 'quick_tools',
    titleAr:
      user.role === 'delivery_rep' || (!canExport && !canManageIntegration && !canPrint)
        ? 'المظهر وإجراءات الجلسة'
        : 'الأدوات السريعة وإجراءات الجلسة',
    descriptionAr:
      user.role === 'delivery_rep' || (!canExport && !canManageIntegration && !canPrint)
        ? 'تخصيص المظهر وتسجيل الخروج الآمن من حسابك'
        : 'الأدوات المصرح لدورك استخدامها فقط',
    items: quickToolsItems,
  });

  return groups;
}

/**
 * التحقق الدقيق مما إذا كان عنصر القائمة الجانبية يطابق الصفحة أو القسم الفرعي المعروض حالياً
 */
export function isDrawerItemActive(
  item: DrawerSectionItem,
  current: NavigationSnapshot,
  isSuperAdmin: boolean
): boolean {
  if (item.kind !== 'navigation' || !item.targetSnapshot) {
    return false;
  }

  const target = item.targetSnapshot;

  // 1. مطابقة ملخص الأداء التحليلي (سواء كمسار مستقل analytics أو تبويب)
  if (target.route === 'analytics' || target.viewTab === 'analytics') {
    return current.route === 'analytics' || current.viewTab === 'analytics';
  }
  if (current.route === 'analytics' || current.viewTab === 'analytics') {
    return false;
  }

  // 2. مطابقة صفحات حالات الشفتات الـ 5 المستقلة
  if (target.casePage) {
    return current.casePage === target.casePage;
  }
  if (current.casePage !== null) {
    return false;
  }

  // 3. مطابقة الصفحة الرئيسية (ملخص البيانات) أو صفحة الجدول الشهري المستقلة
  if (target.route === 'dashboard' || target.route === 'monthly_grid') {
    return current.route === target.route;
  }

  // 4. مطابقة أقسام مركز التحكم الأمني لمدير النظام
  if (target.route === 'security_center' && isSuperAdmin) {
    const inHub =
      current.route === 'security_center' ||
      current.route === 'users' ||
      current.route === 'teams' ||
      current.route === 'audit_logs' ||
      current.route === 'security_settings';
    if (!inHub) return false;
    return (target.securityTab ?? 'overview') === current.securityTab;
  }

  // 5. مطابقة أقسام الملف الشخصي الأربعة + عرض الكل
  if (target.route === 'profile') {
    if (current.route !== 'profile') return false;
    return (target.profileSection ?? 'all') === (current.profileSection ?? 'all');
  }

  // 6. مطابقة بقية المسارات المباشرة
  return current.route === target.route;
}
