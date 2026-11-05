import { AppRoutePage, ProfileSectionId } from '../types';
import { ShiftCasePageType } from '../components/ShiftCaseDetailPage';
import { SecurityHubTab } from '../components/SuperAdminSecurityHub';
import { PROFILE_SECTION_LABELS_AR } from './profileSecurity';

export interface NavigationSnapshot {
  route: AppRoutePage;
  viewTab: 'grid' | 'analytics';
  casePage: ShiftCasePageType | null;
  securityTab: SecurityHubTab;
  profileSection?: ProfileSectionId;
}

const ROUTE_LABELS_AR: Record<AppRoutePage, string> = {
  dashboard: 'الصفحة الرئيسية · ملخص البيانات',
  live_monitoring: 'المراقبة الحية للمناديب والتنبيهات الذكية',
  monthly_grid: 'الجدول الشهري للشفتات',
  analytics: 'ملخص الأداء والتقارير',
  my_portal: 'بوابتي الشخصية',
  requests: 'الطلبات والإجازات',
  security_center: 'مركز التحكم الأمني الشامل',
  users: 'إدارة المستخدمين',
  teams: 'الفرق والمشرفون',
  audit_logs: 'سجل العمليات الأمني',
  security_settings: 'إعدادات الأمان',
  profile: 'ملفي الشخصي وإجراءات الأمان',
};

const CASE_PAGE_LABELS_AR: Record<ShiftCasePageType, string> = {
  all_shifts: 'كل حالات الشفت',
  selected_not_worked: 'اختار الشفت ولم يعمل',
  incomplete_schedule: 'لم يكمل جدولة الشهر',
  worked_only: 'الحاضرون فعلياً',
  absent_only: 'حالات الغياب المسجلة',
};

const SECURITY_TAB_LABELS_AR: Record<SecurityHubTab, string> = {
  overview: 'غرفة القيادة والطوارئ',
  permissions_matrix: 'مصفوفة الصلاحيات التفاعلية',
  users: 'الحسابات والصلاحيات التلقائية',
  teams: 'الفرق ونطاق البيانات',
  integration: 'الربط والنسخ الاحتياطي',
  audit_and_simulator: 'السجل الأمني ومحاكي الصلاحيات',
};

export function areSnapshotsEqual(
  a: NavigationSnapshot,
  b: NavigationSnapshot
): boolean {
  return (
    a.route === b.route &&
    a.viewTab === b.viewTab &&
    a.casePage === b.casePage &&
    a.securityTab === b.securityTab &&
    (a.profileSection ?? 'all') === (b.profileSection ?? 'all')
  );
}

export function pushNavigationSnapshot(
  stack: NavigationSnapshot[],
  current: NavigationSnapshot,
  next: NavigationSnapshot,
  maxDepth = 50
): NavigationSnapshot[] {
  if (areSnapshotsEqual(current, next)) {
    return stack;
  }
  const lastInStack = stack[stack.length - 1];
  const nextStack =
    lastInStack && areSnapshotsEqual(lastInStack, current)
      ? [...stack]
      : [...stack, current];

  if (nextStack.length > maxDepth) {
    return nextStack.slice(nextStack.length - maxDepth);
  }
  return nextStack;
}

export function isSecurityHubRouteForSuperAdmin(
  route: AppRoutePage,
  isSuperAdmin: boolean
): boolean {
  if (!isSuperAdmin) return false;
  return (
    route === 'security_center' ||
    route === 'users' ||
    route === 'teams' ||
    route === 'audit_logs' ||
    route === 'security_settings'
  );
}

export function resolveBackStep(params: {
  stack: NavigationSnapshot[];
  current: NavigationSnapshot;
  defaultRoute: AppRoutePage;
  isSuperAdmin: boolean;
}): {
  nextSnapshot: NavigationSnapshot | null;
  nextStack: NavigationSnapshot[];
  actionType: 'pop_history' | 'fallback_parent' | 'at_root';
} {
  const { stack, current, defaultRoute, isSuperAdmin } = params;

  // 1. إذا كان هناك سجل تنقل سابق في المكدس، نرجع للخطوة السابقة الفعلية
  const trimmedStack = [...stack];
  while (trimmedStack.length > 0) {
    const candidate = trimmedStack.pop()!;
    if (!areSnapshotsEqual(candidate, current)) {
      return {
        nextSnapshot: candidate,
        nextStack: trimmedStack,
        actionType: 'pop_history',
      };
    }
  }

  // 2. إذا كان المكدس فارغاً (مثل فتح رابط فرعي مباشرة)، نتدرج منطقياً للأب ثم الصفحة الرئيسية
  if (current.viewTab !== 'grid') {
    return {
      nextSnapshot: { ...current, viewTab: 'grid' },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (current.casePage !== null) {
    return {
      nextSnapshot: {
        route: 'dashboard',
        viewTab: 'grid',
        casePage: null,
        securityTab: current.securityTab,
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (
    current.route === 'profile' &&
    current.profileSection &&
    current.profileSection !== 'all'
  ) {
    return {
      nextSnapshot: {
        ...current,
        profileSection: 'all',
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (
    isSecurityHubRouteForSuperAdmin(current.route, isSuperAdmin) &&
    current.securityTab !== 'overview'
  ) {
    return {
      nextSnapshot: {
        route: 'security_center',
        viewTab: 'grid',
        casePage: null,
        securityTab: 'overview',
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  if (current.route !== defaultRoute) {
    return {
      nextSnapshot: {
        route: defaultRoute,
        viewTab: 'grid',
        casePage: null,
        securityTab: 'overview',
        profileSection: 'all',
      },
      nextStack: [],
      actionType: 'fallback_parent',
    };
  }

  return {
    nextSnapshot: null,
    nextStack: [],
    actionType: 'at_root',
  };
}

export function getSnapshotLabelAr(
  snapshot: NavigationSnapshot,
  isSuperAdmin: boolean
): string {
  if (snapshot.viewTab === 'analytics') {
    return 'ملخص الأداء والتقارير';
  }
  if (snapshot.casePage) {
    return `تفاصيل: ${CASE_PAGE_LABELS_AR[snapshot.casePage]}`;
  }
  if (isSecurityHubRouteForSuperAdmin(snapshot.route, isSuperAdmin)) {
    return `مركز التحكم الأمني · ${SECURITY_TAB_LABELS_AR[snapshot.securityTab]}`;
  }
  if (
    snapshot.route === 'profile' &&
    snapshot.profileSection &&
    snapshot.profileSection !== 'all'
  ) {
    return `ملفي الشخصي · ${PROFILE_SECTION_LABELS_AR[snapshot.profileSection]}`;
  }
  return ROUTE_LABELS_AR[snapshot.route] || 'الصفحة الرئيسية';
}

export function getBackTargetHintAr(params: {
  stack: NavigationSnapshot[];
  current: NavigationSnapshot;
  defaultRoute: AppRoutePage;
  isSuperAdmin: boolean;
}): string | null {
  const res = resolveBackStep(params);
  if (!res.nextSnapshot) return null;
  return getSnapshotLabelAr(res.nextSnapshot, params.isSuperAdmin);
}

export const VALID_APP_ROUTES: ReadonlySet<string> = new Set<AppRoutePage>([
  'dashboard',
  'live_monitoring',
  'monthly_grid',
  'analytics',
  'my_portal',
  'requests',
  'security_center',
  'users',
  'teams',
  'audit_logs',
  'security_settings',
  'profile',
]);

/**
 * استخراج المسار النشط للتطبيق من الرابط سواء عبر الـ Hash (#monthly_grid)
 * أو عبر الرابط المباشر (/monthly_grid أو /subfolder/monthly_grid) عند إعادة التوجيه بـ .htaccess على InfinityFree
 */
export function resolveRouteFromBrowserLocation(
  locationLike: {
    hash?: string;
    pathname?: string;
    search?: string;
  },
  defaultRoute: AppRoutePage
): {
  route: AppRoutePage;
  source: 'hash' | 'query' | 'pathname' | 'default';
  cleanBasePath: string;
} {
  const rawPathname = locationLike.pathname || '/';
  const segments = rawPathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  const lastSegment = segments[segments.length - 1] || '';
  const isRouteInPath = VALID_APP_ROUTES.has(lastSegment);

  // المسار الأساسي للمجلد (يدعم الجذر / أو مجلد فرعي مثل /shifts/ على الاستضافة)
  const baseSegments = isRouteInPath
    ? segments.slice(0, -1)
    : segments.filter(
        (seg) =>
          seg.toLowerCase() !== 'index.html' &&
          seg.toLowerCase() !== 'index.php' &&
          seg.toLowerCase() !== '404.html'
      );
  const cleanBasePath =
    baseSegments.length > 0 ? `/${baseSegments.join('/')}/` : '/';

  const hashClean = (locationLike.hash || '')
    .replace(/^#\/?/, '')
    .split('?')[0]
    .trim();
  if (VALID_APP_ROUTES.has(hashClean)) {
    return {
      route: hashClean as AppRoutePage,
      source: 'hash',
      cleanBasePath,
    };
  }

  if (locationLike.search) {
    try {
      const params = new URLSearchParams(locationLike.search);
      const qRoute = (params.get('route') || params.get('page') || '').trim();
      if (VALID_APP_ROUTES.has(qRoute)) {
        return {
          route: qRoute as AppRoutePage,
          source: 'query',
          cleanBasePath,
        };
      }
    } catch {
      // تجاهل أخطاء تحليل المعاملات غير القياسية
    }
  }

  if (isRouteInPath) {
    return {
      route: lastSegment as AppRoutePage,
      source: 'pathname',
      cleanBasePath,
    };
  }

  return {
    route: defaultRoute,
    source: 'default',
    cleanBasePath,
  };
}

