import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile,
  ConfirmationResult,
  RecaptchaVerifier,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  normalizeEmailToKey,
  OperationType,
  validateFirestoreConnection,
} from '../firebase';
import {
  AccountStatus,
  PermissionKey,
  SecurityPolicySettings,
  UserProfile,
  UserRole,
} from '../types';
import {
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  DEFAULT_SECURITY_POLICY,
} from '../utils/rbac';
import { recordAuditLog } from '../services/firestoreService';

export type AuthDenyReason =
  | null
  | 'uninvited'
  | 'disabled'
  | 'pending'
  | 'unverified'
  | 'session_expired'
  | 'system_lockdown';

export interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  securityPolicy: SecurityPolicySettings;
  isAuthReady: boolean;
  isBusy: boolean;
  denyReason: AuthDenyReason;
  authError: string;
  phoneConfirmationResult: ConfirmationResult | null;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmailPassword: (email: string, password: string) => Promise<void>;
  registerWithEmailPassword: (params: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    confirmPassword: string;
  }) => Promise<void>;
  sendPhoneOtp: (phoneNumber: string, containerId?: string) => Promise<void>;
  verifyPhoneOtp: (code: string, registrationData?: { fullName?: string }) => Promise<void>;
  clearPhoneOtpState: () => void;
  requestPasswordReset: (email: string) => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function parseUserProfileDoc(
  uid: string,
  raw: Record<string, unknown>
): UserProfile {
  return {
    uid: String(raw.uid || uid),
    name: String(raw.name || 'مستخدم النظام'),
    email: String(raw.email || ''),
    emailKey: String(raw.emailKey || ''),
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    jobTitle: typeof raw.jobTitle === 'string' ? raw.jobTitle : '',
    department: typeof raw.department === 'string' ? raw.department : '',
    bio: typeof raw.bio === 'string' ? raw.bio : '',
    role: (raw.role as UserProfile['role']) || 'delivery_rep',
    extraPermissions: Array.isArray(raw.extraPermissions)
      ? (raw.extraPermissions as UserProfile['extraPermissions'])
      : [],
    revokedPermissions: Array.isArray(raw.revokedPermissions)
      ? (raw.revokedPermissions as UserProfile['revokedPermissions'])
      : [],
    employeeId: String(raw.employeeId || ''),
    teamId: String(raw.teamId || ''),
    status: (raw.status as UserProfile['status']) || 'active',
    personalSessionTimeoutMinutes:
      typeof raw.personalSessionTimeoutMinutes === 'number'
        ? raw.personalSessionTimeoutMinutes
        : 60,
    requireReauthForSensitiveActions:
      Boolean(raw.requireReauthForSensitiveActions),
    securityAlertsEnabled: Boolean(raw.securityAlertsEnabled),
    lastPasswordChangedAt:
      typeof raw.lastPasswordChangedAt === 'string'
        ? raw.lastPasswordChangedAt
        : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    lastLoginAt: typeof raw.lastLoginAt === 'string' ? raw.lastLoginAt : '',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicySettings>(
    DEFAULT_SECURITY_POLICY
  );
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [denyReason, setDenyReason] = useState<AuthDenyReason>(null);
  const [authError, setAuthError] = useState('');
  const [phoneConfirmationResult, setPhoneConfirmationResult] =
    useState<ConfirmationResult | null>(null);

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError('');
  }, []);

  const clearPhoneOtpState = useCallback(() => {
    setPhoneConfirmationResult(null);
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch (_) {}
      recaptchaVerifierRef.current = null;
    }
  }, []);

  // مراقبة وثيقة إعدادات الأمان العالمية في Firestore
  useEffect(() => {
    const policyRef = doc(db, 'securitySettings', 'global');
    const unsubscribe = onSnapshot(
      policyRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSecurityPolicy(snapshot.data() as SecurityPolicySettings);
        }
      },
      (err) => {
        console.warn('Security policy listen notice:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // الاستماع لحالة المصادقة Firebase onAuthStateChanged
  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      setFirebaseUser(fbUser);
      setDenyReason(null);
      setAuthError('');

      if (!fbUser) {
        setUserProfile(null);
        setIsAuthReady(true);
        return;
      }

      const rawEmail = (fbUser.email || '').trim();
      const lowerEmail = rawEmail.toLowerCase();
      const rawPhone = (fbUser.phoneNumber || '').trim();
      const emailKey = rawEmail
        ? normalizeEmailToKey(rawEmail)
        : rawPhone.replace(/[^0-9]/g, '_');

      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const existingSnap = await getDoc(userRef);

        if (!existingSnap.exists()) {
          // 1. الحساب التأسيسي الأول لمدير النظام
          if (lowerEmail === BOOTSTRAPPED_SUPER_ADMIN_EMAIL) {
            const safeName = (fbUser.displayName || 'مدير النظام الرئيسي').trim();
            await setDoc(userRef, {
              uid: fbUser.uid,
              name: safeName.length >= 2 ? safeName.slice(0, 120) : 'مدير النظام',
              email: rawEmail,
              emailKey,
              phone: rawPhone,
              role: 'super_admin',
              extraPermissions: [],
              revokedPermissions: [],
              employeeId: '',
              teamId: '',
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });

            // تهيئة إعدادات الأمان إن لم تكن موجودة
            const polRef = doc(db, 'securitySettings', 'global');
            const polSnap = await getDoc(polRef);
            if (!polSnap.exists()) {
              await setDoc(polRef, {
                policyId: 'global',
                allowSupervisorLeaveRecommendation: true,
                allowViewerExport: true,
                allowOpsIntegrationSync: false,
                enforceAdminMfaNotice: true,
                emergencyReadOnlyMode: false,
                systemLockdownMode: false,
                lockdownMessage: DEFAULT_SECURITY_POLICY.lockdownMessage,
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
                updatedBy: fbUser.uid,
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            // 2. فحص ما إذا كانت هناك دعوة مسبقة من الإدارة
            const invRef = doc(db, 'preprovisionedUsers', emailKey);
            const invSnap = await getDoc(invRef);

            if (invSnap.exists()) {
              const invData = invSnap.data();
              if (invData.status === 'disabled') {
                setDenyReason('disabled');
                setUserProfile(null);
                setIsAuthReady(true);
                return;
              }
              const safeName = String(invData.name || fbUser.displayName || 'مستخدم النظام').trim();

              await setDoc(userRef, {
                uid: fbUser.uid,
                name: safeName.length >= 2 ? safeName.slice(0, 120) : 'مستخدم النظام',
                email: rawEmail || `${rawPhone}@phone.system`,
                emailKey,
                phone: rawPhone,
                role: invData.role || 'delivery_rep',
                extraPermissions: Array.isArray(invData.extraPermissions) ? invData.extraPermissions : [],
                revokedPermissions: Array.isArray(invData.revokedPermissions) ? invData.revokedPermissions : [],
                employeeId: String(invData.employeeId || ''),
                teamId: String(invData.teamId || ''),
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              });
            } else {
              // 3. التسجيل التلقائي الجديد: الدور الافتراضي دائماً مندوب (delivery_rep)
              const safeName = (
                fbUser.displayName ||
                (rawEmail ? rawEmail.split('@')[0] : 'مندوب جديد')
              ).trim();

              await setDoc(userRef, {
                uid: fbUser.uid,
                name: safeName.length >= 2 ? safeName.slice(0, 120) : 'مندوب جديد',
                email: rawEmail || `${rawPhone.replace(/[^0-9]/g, '')}@phone.system`,
                emailKey,
                phone: rawPhone,
                role: 'delivery_rep', // مندوب افتراضياً لجميع الحسابات الجديدة
                extraPermissions: [],
                revokedPermissions: [],
                employeeId: '',
                teamId: '',
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              });
            }
          }
        }

        // الاستماع الفوري لوثيقة المستخدم في Firestore
        profileUnsubscribe = onSnapshot(
          userRef,
          async (docSnap) => {
            if (!docSnap.exists()) {
              setDenyReason('uninvited');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }

            const parsed = parseUserProfileDoc(fbUser.uid, docSnap.data());

            if (parsed.status === 'disabled') {
              setDenyReason('disabled');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }

            if (parsed.status === 'pending') {
              setDenyReason('pending');
              setUserProfile(null);
              setIsAuthReady(true);
              return;
            }

            setDenyReason(null);
            setUserProfile(parsed);
            setIsAuthReady(true);

            // تحديث وقت آخر تسجيل دخول
            try {
              await updateDoc(userRef, {
                lastLoginAt: serverTimestamp(),
              });
            } catch (_) {}
          },
          (err) => {
            console.error('User profile subscription error:', err);
            setIsAuthReady(true);
          }
        );
      } catch (err) {
        console.error('Authentication initial load error:', err);
        setIsAuthReady(true);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  // الطريقة 1: التسجيل اليدوي (Manual Registration)
  const registerWithEmailPassword = async (params: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    confirmPassword: string;
  }): Promise<void> => {
    setIsBusy(true);
    setAuthError('');
    try {
      const name = params.fullName.trim();
      const email = params.email.trim();
      const phone = (params.phone || '').trim();

      if (name.length < 2) {
        throw new Error('يرجى كتابة الاسم الكامل (حرفين على الأقل).');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('صيغة البريد الإلكتروني غير صالحة.');
      }
      if (params.password.length < 6) {
        throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف.');
      }
      if (params.password !== params.confirmPassword) {
        throw new Error('كلمة المرور وتأكيد كلمة المرور غير متطابقين.');
      }

      const credential = await createUserWithEmailAndPassword(auth, email, params.password);
      await updateProfile(credential.user, { displayName: name });

      // حفظ بيانات الحساب الجديد في Firestore
      const userRef = doc(db, 'users', credential.user.uid);
      await setDoc(userRef, {
        uid: credential.user.uid,
        name,
        email,
        emailKey: normalizeEmailToKey(email),
        phone,
        role: 'delivery_rep', // مندوب افتراضياً
        extraPermissions: [],
        revokedPermissions: [],
        employeeId: '',
        teamId: '',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      // إرسال رابط تأكيد البريد الإلكتروني
      try {
        await sendEmailVerification(credential.user);
      } catch (_) {}
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        setAuthError('هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول أو استعادة كلمة المرور.');
      } else if (code === 'auth/weak-password') {
        setAuthError('كلمة المرور ضعيفة جداً. اختر كلمة مرور قوية تحتوي على 6 أحرف على الأقل.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('صيغة البريد الإلكتروني المدخل غير صالحة.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب. يرجى المحاولة لاحقاً.');
      }
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  // الطريقة 2: تسجيل الدخول أو إنشاء الحساب باستخدام Google OAuth
  const loginWithGoogle = async (): Promise<void> => {
    setIsBusy(true);
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('تم إغلاق نافذة تسجيل الدخول عبر Google من قبل المستخدم.');
      } else if (code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'النطاق الحالي';
        setAuthError(
          `النطاق الحالي (${domain}) غير مضاف إلى Authorized domains في Firebase Console -> Authentication -> Settings.`
        );
      } else {
        setAuthError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  // الطريقة 3: تسجيل الدخول / التسجيل برقم الهاتف عبر SMS OTP
  const sendPhoneOtp = async (phoneNumber: string, containerId = 'recaptcha-container'): Promise<void> => {
    setIsBusy(true);
    setAuthError('');
    try {
      const cleanPhone = phoneNumber.trim();
      if (!/^\+?[0-9]{8,16}$/.test(cleanPhone)) {
        throw new Error('يرجى إدخال رقم هاتف صالح بصيغة دولية (مثال: +201012345678).');
      }

      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, containerId, {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          },
        });
      }

      const confirmation = await signInWithPhoneNumber(
        auth,
        cleanPhone,
        recaptchaVerifierRef.current
      );
      setPhoneConfirmationResult(confirmation);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/quota-exceeded') {
        setAuthError('تم تجاوز الحد اليومي لإرسال رسائل SMS. يرجى المحاولة لاحقاً أو مراجعة إعدادات Firebase Phone.');
      } else if (code === 'auth/invalid-phone-number') {
        setAuthError('رقم الهاتف غير صالح. تأكد من كتابة كود الدولة (مثال: +20 لمصر).');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('تم إرسال طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجدداً.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'تعذر إرسال رمز التحقق SMS.');
      }
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const verifyPhoneOtp = async (code: string, registrationData?: { fullName?: string }): Promise<void> => {
    if (!phoneConfirmationResult) {
      throw new Error('لم يتم إرسال رمز تحقق بعد. يرجى طلب الرمز أولاً.');
    }
    setIsBusy(true);
    setAuthError('');
    try {
      const cleanCode = code.trim();
      if (cleanCode.length < 4) {
        throw new Error('يرجى إدخال رمز التحقق المستلم كاملاً.');
      }

      const credential = await phoneConfirmationResult.confirm(cleanCode);
      if (registrationData?.fullName && credential.user) {
        await updateProfile(credential.user, { displayName: registrationData.fullName.trim() });
      }
      clearPhoneOtpState();
    } catch (err: unknown) {
      const codeErr = (err as { code?: string })?.code;
      if (codeErr === 'auth/invalid-verification-code') {
        setAuthError('رمز التحقق غير صحيح. تأكد من كتابة الأرقام الستة بشكل سليم.');
      } else if (codeErr === 'auth/code-expired') {
        setAuthError('انتهت صلاحية رمز التحقق. يرجى طلب إرسال رمز جديد.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'فشل التحقق من الرمز.');
      }
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  // الدخول بالبريد وكلمة المرور للحسابات المسجلة
  const loginWithEmailPassword = async (email: string, pass: string): Promise<void> => {
    setIsBusy(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('تم حظر المحاولات مؤقتاً لتكرار كلمات المرور الخاطئة. انتظر قليلاً ثم حاول ثانية.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  // استعادة كلمة المرور
  const requestPasswordReset = async (email: string): Promise<string> => {
    if (!email.trim()) {
      throw new Error('يرجى إدخال البريد الإلكتروني أولاً.');
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.';
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        throw new Error('هذا البريد غير مسجل بالنظام.');
      }
      throw new Error(err instanceof Error ? err.message : 'تعذر إرسال رابط استعادة كلمة المرور.');
    }
  };

  // تسجيل الخروج
  const logout = async (): Promise<void> => {
    clearPhoneOtpState();
    await signOut(auth);
    setUserProfile(null);
    setFirebaseUser(null);
    setDenyReason(null);
  };

  const contextValue: AuthContextValue = {
    firebaseUser,
    userProfile,
    securityPolicy,
    isAuthReady,
    isBusy,
    denyReason,
    authError,
    phoneConfirmationResult,
    clearAuthError,
    loginWithGoogle,
    loginWithEmailPassword,
    registerWithEmailPassword,
    sendPhoneOtp,
    verifyPhoneOtp,
    clearPhoneOtpState,
    requestPasswordReset,
    logout,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
