import { describe, expect, it } from 'vitest';
import { SecurityPolicySettings, UserProfile, UserRole } from '../types';
import {
  DEFAULT_SECURITY_POLICY,
  canAccessRoute,
  getDefaultRouteForRole,
} from '../utils/rbac';
import { buildRoleWorkspaceConfig } from '../utils/roleWorkspaces';
import { buildDrawerSectionGroups } from '../utils/sectionsCatalog';

function makeUser(role: UserRole, overrides: Partial<UserProfile> = {}): UserProfile {
  const email = overrides.email || `${role}@example.com`;
  return {
    uid: `uid_${role}`,
    name: `مستخدم ${role}`,
    email,
    emailKey: email.toLowerCase(),
    role,
    extraPermissions: [],
    revokedPermissions: [],
    employeeId: role === 'delivery_rep' ? 'EMP007' : '',
    teamId: role === 'supervisor' || role === 'delivery_rep' ? 'TEAM_CAIRO_1' : '',
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    lastLoginAt: '2026-01-01',
    ...overrides,
  };
}

const dummyCounts = {
  employeesCount: 25,
  liveAlertsCount: 2,
  pendingRequestsCount: 4,
  usersCount: 8,
  teamsCount: 3,
  auditLogsCount: 40,
  isDarkMode: false,
};

describe('Dedicated Role Workspaces & Zero-Leak Permission Isolation', () => {
  it('provides Super Admin with full governance workspace and simulation/sync capabilities', () => {
    const admin = makeUser('super_admin', { email: 'aladdinamrr@gmail.com' });
    const ws = buildRoleWorkspaceConfig(admin, DEFAULT_SECURITY_POLICY);

    expect(ws.role).toBe('super_admin');
    expect(ws.isReadOnlyWorkspace).toBe(false);
    expect(ws.isSingleTeamScoped).toBe(false);
    expect(ws.primaryNavTabs.map((t) => t.route)).toEqual([
      'dashboard',
      'live_monitoring',
      'monthly_grid',
      'analytics',
      'requests',
      'security_center',
      'profile',
    ]);
    expect(ws.capabilities.canManageSecurityPolicy).toBe(true);
    expect(ws.capabilities.canManageUsers).toBe(true);
    expect(ws.capabilities.canManageIntegrationSync).toBe(true);
    expect(ws.capabilities.canUseSimulationLab).toBe(true);
  });

  it('isolates Operations Manager from Super Admin security settings and JSON sync unless explicitly granted', () => {
    const ops = makeUser('operations_manager');
    const ws = buildRoleWorkspaceConfig(ops, DEFAULT_SECURITY_POLICY);

    expect(ws.primaryNavTabs.map((t) => t.route)).toEqual([
      'dashboard',
      'live_monitoring',
      'monthly_grid',
      'analytics',
      'requests',
      'teams',
      'users',
      'audit_logs',
      'profile',
    ]);
    expect(ws.capabilities.canManageSecurityPolicy).toBe(false);
    expect(ws.capabilities.canManageUsers).toBe(false);
    expect(ws.capabilities.canManageTeams).toBe(false);
    // integration.manage is NOT granted by default to operations_manager
    expect(ws.capabilities.canManageIntegrationSync).toBe(false);
    expect(ws.capabilities.canUseSimulationLab).toBe(true);

    const drawerGroups = buildDrawerSectionGroups({
      user: ops,
      policy: DEFAULT_SECURITY_POLICY,
      counts: dummyCounts,
    });
    const drawerItemIds = drawerGroups.flatMap((g) => g.items.map((i) => i.id));
    expect(drawerItemIds).not.toContain('act_sync_json');
    expect(drawerItemIds).not.toContain('nav_security_settings');
    expect(drawerItemIds).not.toContain('nav_sec_hub_overview');

    // Granting integration.manage & teams.manage via policy immediately unlocks them
    const customPolicy: SecurityPolicySettings = {
      ...DEFAULT_SECURITY_POLICY,
      opsGrantedPerms: ['integration.manage', 'teams.manage'],
      opsRevokedPerms: ['users.view', 'audit.view'],
    };
    const wsCustom = buildRoleWorkspaceConfig(ops, customPolicy);
    expect(wsCustom.capabilities.canManageIntegrationSync).toBe(true);
    expect(wsCustom.capabilities.canManageTeams).toBe(true);
    expect(wsCustom.primaryNavTabs.map((t) => t.route)).not.toContain('users');
    expect(wsCustom.primaryNavTabs.map((t) => t.route)).not.toContain('audit_logs');
  });

  it('provides Supervisor with single-team workspace and zero employee-edit, shift-schedule-edit, sync, or simulation leaks', () => {
    const sup = makeUser('supervisor');
    const ws = buildRoleWorkspaceConfig(sup, DEFAULT_SECURITY_POLICY, {
      teamName: 'فريق شرق القاهرة',
    });

    expect(ws.isSingleTeamScoped).toBe(true);
    expect(ws.scopeBadgeAr).toContain('فريق شرق القاهرة');
    expect(ws.primaryNavTabs.map((t) => t.route)).toEqual([
      'dashboard',
      'live_monitoring',
      'monthly_grid',
      'analytics',
      'requests',
      'teams',
      'profile',
    ]);

    expect(ws.capabilities.canRecordOrEditAnyAttendance).toBe(true);
    expect(ws.capabilities.canReviewRequests).toBe(true);
    // Strict zero-leak checks for Supervisor
    expect(ws.capabilities.canCreateEmployee).toBe(false);
    expect(ws.capabilities.canEditEmployee).toBe(false);
    expect(ws.capabilities.canDeleteEmployee).toBe(false);
    expect(ws.capabilities.canEditShiftSelection).toBe(false);
    expect(ws.capabilities.canDeleteAttendance).toBe(false);
    expect(ws.capabilities.canUseSimulationLab).toBe(false);
    expect(ws.capabilities.canManageIntegrationSync).toBe(false);
    expect(ws.capabilities.canManageTeams).toBe(false);
    expect(ws.capabilities.canViewUsers).toBe(false);
    expect(ws.capabilities.canViewAuditLogs).toBe(false);

    const drawerGroups = buildDrawerSectionGroups({
      user: sup,
      policy: DEFAULT_SECURITY_POLICY,
      counts: dummyCounts,
    });
    const drawerItemIds = drawerGroups.flatMap((g) => g.items.map((i) => i.id));
    expect(drawerItemIds).not.toContain('act_add_employee');
    expect(drawerItemIds).not.toContain('act_sync_json');
    expect(drawerItemIds).not.toContain('nav_users');
    expect(drawerItemIds).not.toContain('nav_audit_logs');
  });

  it('provides Delivery Rep with personal self-service portal only and hides fleet/export/print/admin controls', () => {
    const rep = makeUser('delivery_rep');
    const ws = buildRoleWorkspaceConfig(rep, DEFAULT_SECURITY_POLICY, {
      employeeName: 'أحمد سالم',
      employeeCode: 'EMP007',
    });

    expect(ws.scopeBadgeAr).toContain('أحمد سالم');
    expect(ws.primaryNavTabs.map((t) => t.route)).toEqual([
      'my_portal',
      'requests',
      'profile',
    ]);

    expect(ws.capabilities.canSubmitRequests).toBe(true);
    expect(ws.capabilities.canShareOwnLiveTelemetry).toBe(true);
    expect(ws.capabilities.canExportReports).toBe(false);
    expect(ws.capabilities.canPrintReports).toBe(false);
    expect(ws.capabilities.canUseSimulationLab).toBe(false);
    expect(ws.capabilities.canManageIntegrationSync).toBe(false);

    const drawerGroups = buildDrawerSectionGroups({
      user: rep,
      policy: DEFAULT_SECURITY_POLICY,
      counts: dummyCounts,
    });
    const drawerItemIds = drawerGroups.flatMap((g) => g.items.map((i) => i.id));
    expect(drawerItemIds).not.toContain('act_print');
    expect(drawerItemIds).not.toContain('act_export_csv');
    expect(drawerItemIds).not.toContain('act_sync_json');
    expect(drawerItemIds).not.toContain('nav_dashboard');
    expect(drawerItemIds).not.toContain('nav_live_monitoring');

    // Revoking leave.request hides requests route immediately for delivery_rep
    const repNoLeave = makeUser('delivery_rep', {
      revokedPermissions: ['leave.request'],
    });
    expect(canAccessRoute(repNoLeave, 'requests', DEFAULT_SECURITY_POLICY)).toBe(false);
    const wsNoLeave = buildRoleWorkspaceConfig(repNoLeave, DEFAULT_SECURITY_POLICY);
    expect(wsNoLeave.primaryNavTabs.map((t) => t.route)).toEqual([
      'my_portal',
      'profile',
    ]);
  });

  it('provides Viewer with strictly read-only workspace and respects allowViewerExport policy for export & print', () => {
    const viewer = makeUser('viewer');
    const noExportPolicy: SecurityPolicySettings = {
      ...DEFAULT_SECURITY_POLICY,
      allowViewerExport: false,
    };

    const wsNoExport = buildRoleWorkspaceConfig(viewer, noExportPolicy);
    expect(wsNoExport.isReadOnlyWorkspace).toBe(true);
    expect(wsNoExport.primaryNavTabs.map((t) => t.route)).toEqual([
      'dashboard',
      'live_monitoring',
      'monthly_grid',
      'analytics',
      'profile',
    ]);
    expect(wsNoExport.capabilities.canExportReports).toBe(false);
    expect(wsNoExport.capabilities.canPrintReports).toBe(false);
    expect(wsNoExport.capabilities.canUseSimulationLab).toBe(false);
    expect(wsNoExport.capabilities.canManageIntegrationSync).toBe(false);
    expect(wsNoExport.capabilities.canSubmitRequests).toBe(false);

    const drawerNoExport = buildDrawerSectionGroups({
      user: viewer,
      policy: noExportPolicy,
      counts: dummyCounts,
    });
    const idsNoExport = drawerNoExport.flatMap((g) => g.items.map((i) => i.id));
    expect(idsNoExport).not.toContain('act_export_csv');
    expect(idsNoExport).not.toContain('act_print');
    expect(idsNoExport).not.toContain('act_sync_json');
    expect(idsNoExport).not.toContain('nav_requests');
    expect(idsNoExport).not.toContain('nav_teams');

    // Enabling allowViewerExport unlocks CSV & Print while keeping Viewer read-only
    const allowExportPolicy: SecurityPolicySettings = {
      ...DEFAULT_SECURITY_POLICY,
      allowViewerExport: true,
    };
    const wsAllowExport = buildRoleWorkspaceConfig(viewer, allowExportPolicy);
    expect(wsAllowExport.isReadOnlyWorkspace).toBe(true);
    expect(wsAllowExport.capabilities.canExportReports).toBe(true);
    expect(wsAllowExport.capabilities.canPrintReports).toBe(true);
  });

  it('enforces emergencyReadOnlyMode across non-admin workspaces while preserving read-only route access and fallback defaults', () => {
    const freezePolicy: SecurityPolicySettings = {
      ...DEFAULT_SECURITY_POLICY,
      emergencyReadOnlyMode: true,
    };

    const ops = makeUser('operations_manager');
    const opsWs = buildRoleWorkspaceConfig(ops, freezePolicy);
    expect(opsWs.isReadOnlyWorkspace).toBe(true);
    expect(opsWs.capabilities.canCreateEmployee).toBe(false);
    expect(opsWs.capabilities.canUseSimulationLab).toBe(false);
    // Requests route stays accessible in read-only mode so pending requests can still be inspected
    expect(canAccessRoute(ops, 'requests', freezePolicy)).toBe(true);

    const rep = makeUser('delivery_rep');
    const repWs = buildRoleWorkspaceConfig(rep, freezePolicy);
    expect(repWs.isReadOnlyWorkspace).toBe(true);
    expect(repWs.capabilities.canSubmitRequests).toBe(false);
    expect(repWs.capabilities.canShareOwnLiveTelemetry).toBe(false);
    expect(canAccessRoute(rep, 'requests', freezePolicy)).toBe(true);

    // Super Admin remains unrestricted during emergencyReadOnlyMode
    const admin = makeUser('super_admin');
    const adminWs = buildRoleWorkspaceConfig(admin, freezePolicy);
    expect(adminWs.isReadOnlyWorkspace).toBe(false);
    expect(adminWs.capabilities.canUseSimulationLab).toBe(true);

    // Default route fallback if all fleet-view permissions are revoked on a custom user
    const customUser = makeUser('viewer', {
      revokedPermissions: [
        'employees.view_all',
        'shifts.view_all',
        'attendance.view_all',
        'reports.view_all',
      ],
    });
    expect(getDefaultRouteForRole('viewer', customUser, DEFAULT_SECURITY_POLICY)).toBe(
      'profile'
    );
  });
});
