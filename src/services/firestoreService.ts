import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountStatus,
  AttendanceRecord,
  AuditLogItem,
  Employee,
  PreprovisionedInvitation,
  SecurityPolicySettings,
  Team,
  UserProfile,
  UserRole,
  WorkflowRequest,
} from '../types';

export function formatFirestoreTimestamp(ts: unknown): string {
  if (!ts) return '—';
  if (typeof ts === 'string') return ts;
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleString('ar-EG');
  }
  if (typeof ts === 'object' && 'seconds' in (ts as { seconds: number })) {
    return new Date((ts as { seconds: number }).seconds * 1000).toLocaleString('ar-EG');
  }
  return String(ts);
}

export async function recordAuditLog(
  actor: UserProfile,
  entry: {
    category: 'security' | 'operational';
    action: string;
    targetType: string;
    targetId: string;
    beforeSummary?: string;
    afterSummary?: string;
    reason?: string;
    result?: 'success' | 'denied' | 'failure';
  }
): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    const logRef = doc(db, 'auditLogs', logId);
    await setDoc(logRef, {
      logId,
      actorUserId: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      category: entry.category,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeSummary: entry.beforeSummary || '',
      afterSummary: entry.afterSummary || '',
      reason: entry.reason || 'إجراء تنفيذي داخل النظام',
      result: entry.result || 'success',
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit log write error:', err);
  }
}

// إدارة المستخدمين
export async function updateUserAccountByAdmin(
  actor: UserProfile,
  targetUid: string,
  updates: Partial<UserProfile>,
  reason = 'تعديل بيانات المستخدم من لوحة التحكم'
): Promise<void> {
  const userRef = doc(db, 'users', targetUid);
  try {
    const snap = await getDoc(userRef);
    const beforeData = snap.exists() ? snap.data() : {};
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'security',
      action: 'تعديل حساب مستخدم',
      targetType: 'user',
      targetId: targetUid,
      beforeSummary: JSON.stringify(beforeData),
      afterSummary: JSON.stringify(updates),
      reason,
      result: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function deleteUserAccountByAdmin(
  actor: UserProfile,
  targetUid: string,
  targetEmail: string
): Promise<void> {
  const userRef = doc(db, 'users', targetUid);
  try {
    await deleteDoc(userRef);
    await recordAuditLog(actor, {
      category: 'security',
      action: 'حذف حساب مستخدم نهائياً',
      targetType: 'user',
      targetId: targetUid,
      beforeSummary: targetEmail,
      afterSummary: 'تم الحذف',
      reason: 'إزالة الحساب من قبل مدير النظام',
      result: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${targetUid}`);
  }
}

export async function createPreprovisionedUser(
  actor: UserProfile,
  invitation: PreprovisionedInvitation
): Promise<void> {
  const ref = doc(db, 'preprovisionedUsers', invitation.emailKey);
  try {
    await setDoc(ref, {
      ...invitation,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'security',
      action: 'تخصيص دعوة مستخدم مسبقاً',
      targetType: 'preprovisionedUser',
      targetId: invitation.emailKey,
      afterSummary: `الدور: ${invitation.role} - البريد: ${invitation.email}`,
      reason: 'تجهيز حساب جديد معتمد',
      result: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `preprovisionedUsers/${invitation.emailKey}`);
  }
}

export async function updatePreprovisionedInvitationByAdmin(
  actor: UserProfile,
  emailKey: string,
  updates: Partial<PreprovisionedInvitation>
): Promise<void> {
  const ref = doc(db, 'preprovisionedUsers', emailKey);
  try {
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'security',
      action: 'تعديل دعوة مسبقة',
      targetType: 'preprovisionedUser',
      targetId: emailKey,
      afterSummary: JSON.stringify(updates),
      result: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `preprovisionedUsers/${emailKey}`);
  }
}

export async function deletePreprovisionedInvitationByAdmin(
  actor: UserProfile,
  emailKey: string
): Promise<void> {
  const ref = doc(db, 'preprovisionedUsers', emailKey);
  try {
    await deleteDoc(ref);
    await recordAuditLog(actor, {
      category: 'security',
      action: 'إلغاء دعوة مسبقة',
      targetType: 'preprovisionedUser',
      targetId: emailKey,
      result: 'success',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `preprovisionedUsers/${emailKey}`);
  }
}

// إدارة المندوبين
export async function createEmployee(actor: UserProfile, emp: Employee): Promise<void> {
  const ref = doc(db, 'employees', emp.id);
  try {
    await setDoc(ref, {
      ...emp,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'إضافة مندوب جديد',
      targetType: 'employee',
      targetId: emp.id,
      afterSummary: `${emp.fullName} (${emp.employeeCode})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `employees/${emp.id}`);
  }
}

export async function updateEmployee(
  actor: UserProfile,
  empId: string,
  updates: Partial<Employee>
): Promise<void> {
  const ref = doc(db, 'employees', empId);
  try {
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'تعديل بيانات مندوب',
      targetType: 'employee',
      targetId: empId,
      afterSummary: JSON.stringify(updates),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `employees/${empId}`);
  }
}

export async function deleteEmployee(actor: UserProfile, empId: string): Promise<void> {
  const ref = doc(db, 'employees', empId);
  try {
    await deleteDoc(ref);
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'حذف سجل مندوب',
      targetType: 'employee',
      targetId: empId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `employees/${empId}`);
  }
}

// الحضور والانصراف
export async function recordAttendance(
  actor: UserProfile,
  record: AttendanceRecord
): Promise<void> {
  const ref = doc(db, 'attendance', record.id);
  try {
    await setDoc(ref, {
      ...record,
      recordedBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `attendance/${record.id}`);
  }
}

export async function updateAttendance(
  actor: UserProfile,
  recordId: string,
  updates: Partial<AttendanceRecord>
): Promise<void> {
  const ref = doc(db, 'attendance', recordId);
  try {
    await updateDoc(ref, {
      ...updates,
      recordedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `attendance/${recordId}`);
  }
}

// إدارة الفرق
export async function createTeam(actor: UserProfile, team: Team): Promise<void> {
  const ref = doc(db, 'teams', team.teamId);
  try {
    await setDoc(ref, {
      ...team,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'إنشاء فريق جديد',
      targetType: 'team',
      targetId: team.teamId,
      afterSummary: team.teamName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `teams/${team.teamId}`);
  }
}

export async function updateTeam(
  actor: UserProfile,
  teamId: string,
  updates: Partial<Team>
): Promise<void> {
  const ref = doc(db, 'teams', teamId);
  try {
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'تعديل بيانات فريق',
      targetType: 'team',
      targetId: teamId,
      afterSummary: JSON.stringify(updates),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `teams/${teamId}`);
  }
}

export async function deleteTeam(actor: UserProfile, teamId: string): Promise<void> {
  const ref = doc(db, 'teams', teamId);
  try {
    await deleteDoc(ref);
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'حذف فريق',
      targetType: 'team',
      targetId: teamId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `teams/${teamId}`);
  }
}

// الطلبات والإجازات
export async function submitWorkflowRequest(
  actor: UserProfile,
  req: WorkflowRequest
): Promise<void> {
  const ref = doc(db, 'requests', req.requestId);
  try {
    await setDoc(ref, {
      ...req,
      submittedBy: actor.uid,
      submitterRole: actor.role,
      status: 'pending',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'operational',
      action: 'تقديم طلب إجازة / تصحيح شفت',
      targetType: 'request',
      targetId: req.requestId,
      afterSummary: `${req.requestType} - ${req.requestDate}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `requests/${req.requestId}`);
  }
}

export async function reviewWorkflowRequest(
  actor: UserProfile,
  requestId: string,
  status: 'recommended' | 'approved' | 'rejected',
  comment: string
): Promise<void> {
  const ref = doc(db, 'requests', requestId);
  try {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (status === 'recommended') {
      updates.supervisorRecommendation = comment;
    } else {
      updates.reviewedBy = actor.uid;
      updates.reviewerName = actor.name;
      updates.reviewComment = comment;
      updates.reviewedAt = serverTimestamp();
    }
    await updateDoc(ref, updates);
    await recordAuditLog(actor, {
      category: 'operational',
      action: `مراجعة طلب: ${status}`,
      targetType: 'request',
      targetId: requestId,
      afterSummary: comment,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${requestId}`);
  }
}

// إعدادات الأمان
export async function updateSecuritySettings(
  actor: UserProfile,
  settings: Partial<SecurityPolicySettings>
): Promise<void> {
  const ref = doc(db, 'securitySettings', 'global');
  try {
    await updateDoc(ref, {
      ...settings,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(actor, {
      category: 'security',
      action: 'تحديث إعدادات الأمان وسياسات النظام',
      targetType: 'securitySettings',
      targetId: 'global',
      afterSummary: JSON.stringify(settings),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'securitySettings/global');
  }
}
