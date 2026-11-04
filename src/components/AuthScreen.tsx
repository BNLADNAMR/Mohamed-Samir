import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  AlertTriangle,
  LogOut,
  KeyRound,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAndroidHardwareBackButton } from '../utils/androidBackBridge';

interface AuthScreenProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isDarkMode,
  onToggleDarkMode,
}) => {
  const {
    firebaseUser,
    securityPolicy,
    isBusy,
    denyReason,
    authError,
    clearAuthError,
    loginWithGoogle,
    loginWithEmailPassword,
    requestPasswordReset,
    sendVerificationEmailManually,
    recheckEmailVerification,
    logout,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [resetStatus, setResetStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    if (!email.trim() || !password) return;
    await loginWithEmailPassword(email, password);
  };

  const handleResetPassword = async () => {
    clearAuthError();
    setResetStatus(null);
    try {
      const msg = await requestPasswordReset(email);
      setResetStatus({ type: 'success', message: msg });
    } catch (err) {
      setResetStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر إرسال رابط إعادة التعيين.',
      });
    }
  };

  const hasAuthSubState =
    showEmailForm ||
    Boolean(firebaseUser) ||
    Boolean(authError) ||
    Boolean(resetStatus);

  const [exitHintVisible, setExitHintVisible] = useState(false);

  const handleAuthBackStep = (): boolean => {
    if (showEmailForm) {
      setShowEmailForm(false);
      setResetStatus(null);
      clearAuthError();
      return true;
    }
    if (resetStatus || authError) {
      setResetStatus(null);
      clearAuthError();
      return true;
    }
    if (firebaseUser) {
      void logout();
      return true;
    }
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    }
    return false;
  };

  const handleAuthBack = async () => {
    handleAuthBackStep();
  };

  useAndroidHardwareBackButton({
    onStepBackOrCloseOverlay: handleAuthBackStep,
    onShowExitConfirmHint: () => {
      setExitHintVisible(true);
      window.setTimeout(() => setExitHintVisible(false), 2200);
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {exitHintVisible && (
        <div className="fixed bottom-4 left-4 z-50 px-4 py-2.5 rounded-lg shadow-lg border bg-slate-900 text-white border-slate-700 text-xs font-bold">
          اضغط زر الرجوع مرة أخرى للخروج من التطبيق.
        </div>
      )}
      {/* شريط علوي متسق مع هوية التطبيق وزر الرجوع للخلف */}
      <header className="sticky top-0 z-30 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 px-6 py-3.5">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAuthBack}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="الرجوع للخلف"
            >
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              <span>رجوع للخلف</span>
            </button>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span className="text-base font-extrabold tracking-tight">
                نظام متابعة الشفتات وأداء المندوبين
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="min-h-[40px] border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {isDarkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                الوضع الفاتح
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                الوضع الداكن
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 border-b border-slate-800 text-white">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-1">
              <Lock className="w-3.5 h-3.5" />
              بوابة الدخول الآمن (RBAC)
            </div>
            <h1 className="text-lg font-extrabold">تسجيل الدخول إلى النظام</h1>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              سجّل دخولك مباشرة بحساب Google الموثق دون الحاجة إلى دعوة مسبقة، وتُضبط صلاحياتك ونطاق فريقك تلقائياً وبشكل فوري بواسطة مدير النظام.
            </p>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {hasAuthSubState && (
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleAuthBack}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رجوع للخلف</span>
                </button>
                <span className="text-[11px] text-slate-400">
                  العودة لشاشة الدخول الرئيسية
                </span>
              </div>
            )}
            {/* رسائل منع الوصول للحسابات غير المصرح بها أو المعطلة */}
            {denyReason === 'uninvited' && firebaseUser && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  التسجيل العام مغلق — حساب غير مصرح له
                </div>
                <p className="leading-relaxed">
                  البريد الإلكتروني{' '}
                  <strong className="font-mono" dir="ltr">
                    {firebaseUser.email}
                  </strong>{' '}
                  غير مدرج ضمن قائمة المستخدمين المعتمدين في النظام. يرجى مراجعة مدير النظام لإضافة حسابك وتحديد دورك الوظيفي أولاً.
                </p>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2 px-3 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  تسجيل الخروج والتبديل إلى حساب آخر
                </button>
              </div>
            )}

            {denyReason === 'disabled' && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  تم تعطيل هذا الحساب
                </div>
                <p className="leading-relaxed">
                  تم إيقاف صلاحية دخول هذا الحساب من قبل إدارة النظام. لا يمكنك استعراض أو تعديل أي بيانات حالياً.
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {denyReason === 'pending' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  الحساب بانتظار التفعيل الإداري
                </div>
                <p className="leading-relaxed">
                  تم تسجيل بريدك الإلكتروني ولكن حالة الحساب لا تزال بانتظار التفعيل النهائي من مدير النظام.
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {denyReason === 'unverified' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 space-y-2.5">
                <div className="font-bold text-sm">يرجى تأكيد البريد الإلكتروني أولاً</div>
                <p className="leading-relaxed">
                  يشترط النظام التحقق من ملكية البريد الإلكتروني قبل تفعيل صلاحيات الحساب. بعد النقر على رابط التفعيل في بريدك، اضغط على زر التحديث أدناه أو أعد تسجيل الدخول.
                </p>
                {firebaseUser && (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        setResetStatus(null);
                        try {
                          const msg = await sendVerificationEmailManually();
                          setResetStatus({ type: 'success', message: msg });
                        } catch (err) {
                          setResetStatus({
                            type: 'error',
                            message:
                              err instanceof Error
                                ? err.message
                                : 'تعذر إرسال رسالة التوثيق.',
                          });
                        }
                      }}
                      className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors cursor-pointer"
                    >
                      إرسال رابط تأكيد البريد الإلكتروني
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setResetStatus(null);
                        const verified = await recheckEmailVerification();
                        if (verified) {
                          setResetStatus({
                            type: 'success',
                            message:
                              'تم التحقق من توثيق بريدك بنجاح! يرجى تسجيل الدخول الآن لتفعيل حسابك.',
                          });
                        } else {
                          setResetStatus({
                            type: 'error',
                            message:
                              'لم يظهر تأكيد البريد بعد. يرجى فتح الرسالة في بريدك والضغط على رابط التفعيل أولاً.',
                          });
                        }
                      }}
                      className="w-full py-2 px-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-bold transition-colors cursor-pointer"
                    >
                      تحديث الحالة بعد الضغط على رابط التفعيل
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors cursor-pointer"
                    >
                      تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
            )}

            {denyReason === 'system_lockdown' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  وضع القفل الأمني المؤقت نشط (System Lockdown)
                </div>
                <p className="leading-relaxed">
                  {securityPolicy.lockdownMessage ||
                    'النظام مغلق مؤقتاً لغير مدير النظام (Super Admin) لإجراء مراجعة أمنية.'}
                </p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    تسجيل الخروج أو الدخول بحساب مدير النظام (Super Admin)
                  </button>
                )}
              </div>
            )}

            {denyReason === 'session_expired' && !firebaseUser && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 font-medium">
                انتهت جلستك السابقة تلقائياً بسبب عدم النشاط حفاظاً على أمان البيانات. يرجى تسجيل الدخول مجدداً.
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
                {authError}
              </div>
            )}

            {resetStatus && (
              <div
                className={`p-3 rounded-lg border font-medium leading-relaxed ${
                  resetStatus.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                }`}
              >
                {resetStatus.message}
              </div>
            )}

            {!firebaseUser && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={loginWithGoogle}
                  className="gsi-material-button w-full min-h-[46px] py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-xl font-bold text-sm flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-5 h-5 block"
                      aria-hidden="true"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </span>
                  <span className="gsi-material-button-contents">
                    {isBusy
                      ? 'جارٍ التحقق من الهوية عبر Google...'
                      : 'تسجيل الدخول باستخدام Google'}
                  </span>
                </button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <div className="relative flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowEmailForm((prev) => !prev)}
                      className="bg-white dark:bg-slate-900 px-3 text-[11px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      {showEmailForm
                        ? 'إخفاء نموذج البريد وكلمة المرور'
                        : 'أو الدخول عبر البريد الإلكتروني وكلمة المرور'}
                    </button>
                  </div>
                </div>

                {showEmailForm && (
                  <form onSubmit={handleEmailLogin} className="space-y-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        البريد الإلكتروني الوظيفي
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (authError) clearAuthError();
                          }}
                          placeholder="name@company.com"
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg pl-3 pr-9 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                        <Mail className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          كلمة المرور
                        </label>
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3" />
                          إعادة تعيين كلمة المرور
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (authError) clearAuthError();
                        }}
                        placeholder="••••••••"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full py-2.5 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                      دخول بالبريد وكلمة المرور
                    </button>
                  </form>
                )}
              </>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              محمي بواسطة قواعد أمان Cloud Firestore (Zero-Trust RBAC). جميع عمليات الدخول والعمليات الحساسة مسجلة في سجل المراجعة الأمني (Audit Log).
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
