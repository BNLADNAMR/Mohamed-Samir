import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  User,
  KeyRound,
  AlertTriangle,
  LogOut,
  Sun,
  Moon,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthScreenProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot_password';
type AuthMethod = 'google' | 'email' | 'phone';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isDarkMode,
  onToggleDarkMode,
}) => {
  const {
    firebaseUser,
    isBusy,
    denyReason,
    authError,
    clearAuthError,
    loginWithGoogle,
    loginWithEmailPassword,
    registerWithEmailPassword,
    sendPhoneOtp,
    verifyPhoneOtp,
    phoneConfirmationResult,
    clearPhoneOtpState,
    requestPasswordReset,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [method, setMethod] = useState<AuthMethod>('google');

  // حقول النموذج اليدوي
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // حقول التحقق برقم الهاتف OTP
  const [phoneForOtp, setPhoneForOtp] = useState('+20');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [feedbackStatus, setFeedbackStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // تسجيل الدخول بالبريد
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setFeedbackStatus(null);
    if (!email.trim() || !password) return;
    await loginWithEmailPassword(email, password);
  };

  // التسجيل اليدوي بالبريد
  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setFeedbackStatus(null);
    try {
      await registerWithEmailPassword({
        fullName,
        email,
        phone,
        password,
        confirmPassword,
      });
      setFeedbackStatus({
        type: 'success',
        message: 'تم إنشاء الحساب بنجاح وتعيين دور (مندوب)! جاري تحميل بياناتك...',
      });
    } catch (_) {}
  };

  // إرسال كود OTP للهاتف
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setFeedbackStatus(null);
    try {
      await sendPhoneOtp(phoneForOtp);
      setOtpSent(true);
      setFeedbackStatus({
        type: 'success',
        message: 'تم إرسال رمز التحقق (SMS) إلى رقم هاتفك. يرجى إدخال الرمز المكون من 6 أرقام.',
      });
    } catch (_) {}
  };

  // تأكيد كود OTP
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setFeedbackStatus(null);
    try {
      await verifyPhoneOtp(otpCode, { fullName: fullName.trim() });
      setFeedbackStatus({
        type: 'success',
        message: 'تم التحقق بنجاح وتفعيل الحساب!',
      });
    } catch (_) {}
  };

  // استعادة كلمة المرور
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setFeedbackStatus(null);
    try {
      const msg = await requestPasswordReset(email);
      setFeedbackStatus({ type: 'success', message: msg });
    } catch (err) {
      setFeedbackStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر إرسال رابط استعادة كلمة المرور.',
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* شريط الرأس */}
      <header className="sticky top-0 z-30 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 px-6 py-3.5">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            <div>
              <span className="text-base font-extrabold tracking-tight block">
                نظام متابعة الشفتات وأداء المندوبين
              </span>
              <span className="text-[11px] text-slate-400">
                بوابة الدخول والتحقق الآمن (Zero-Trust RBAC)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
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
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          {/* رأس البطاقة وتبديل الأوضاع */}
          <div className="bg-slate-900 dark:bg-slate-950 px-6 pt-5 pb-4 border-b border-slate-800 text-white">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>نظام المصادقة الشامل</span>
              </div>
              <span className="text-[10px] bg-indigo-950 border border-indigo-700/50 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                Production Ready
              </span>
            </div>

            {/* أزرار التبديل الرئيسية */}
            <div className="flex rounded-lg bg-slate-800/80 p-1 border border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  clearAuthError();
                  setFeedbackStatus(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  clearAuthError();
                  setFeedbackStatus(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                إنشاء حساب جديد
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot_password');
                  clearAuthError();
                  setFeedbackStatus(null);
                }}
                className={`py-1.5 px-3 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  mode === 'forgot_password'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                استعادة المرور
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {/* رسائل التنبيه والمنع الإداري */}
            {denyReason === 'disabled' && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  تم إيقاف هذا الحساب
                </div>
                <p>الحساب موقوف من قبل الإدارة. يرجى التواصل مع مدير النظام.</p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold"
                  >
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {denyReason === 'pending' && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  الحساب بانتظار التفعيل الإداري
                </div>
                <p>تم استلام طلب تسجيلك، وهو قيد المراجعة بواسطة المشرف لتفعيل الصلاحيات.</p>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg font-bold"
                  >
                    تسجيل الخروج
                  </button>
                )}
              </div>
            )}

            {/* رسائل الأخطاء والنجاح */}
            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 font-medium">
                {authError}
              </div>
            )}

            {feedbackStatus && (
              <div
                className={`p-3 rounded-lg border font-medium ${
                  feedbackStatus.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                }`}
              >
                {feedbackStatus.message}
              </div>
            )}

            {!firebaseUser && (
              <>
                {/* تبويبات الطرق الثلاث */}
                {mode !== 'forgot_password' && (
                  <div className="grid grid-cols-3 gap-2 pb-2">
                    <button
                      type="button"
                      onClick={() => setMethod('google')}
                      className={`p-2 rounded-lg border text-center font-bold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                        method === 'google'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>حساب Google</span>
                      <span className="text-[10px] font-normal text-slate-400">OAuth فوري</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMethod('email')}
                      className={`p-2 rounded-lg border text-center font-bold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                        method === 'email'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>البريد الإلكتروني</span>
                      <span className="text-[10px] font-normal text-slate-400">يدوي مشفر</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMethod('phone')}
                      className={`p-2 rounded-lg border text-center font-bold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                        method === 'phone'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>رقم الهاتف</span>
                      <span className="text-[10px] font-normal text-slate-400">رمز SMS (OTP)</span>
                    </button>
                  </div>
                )}

                {/* تنبيه الدور الافتراضي للمستخدم الجديد */}
                {mode === 'register' && (
                  <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200 text-[11px] leading-relaxed flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>سياسة الأمان (RBAC):</strong> يحصل الحساب الجديد تلقائياً على دور{' '}
                      <strong>مندوب (Representative)</strong>. ولا يمكن الحصول على صلاحيات إدارة إلا بترقية معتمدة من مدير النظام.
                    </div>
                  </div>
                )}

                {/* الطريقة 1: Google OAuth */}
                {method === 'google' && mode !== 'forgot_password' && (
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={loginWithGoogle}
                      className="w-full min-h-[46px] py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-xl font-bold text-sm flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer"
                    >
                      <svg className="w-5 h-5 block" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                      <span>
                        {isBusy
                          ? 'جارٍ التحقق...'
                          : mode === 'register'
                          ? 'إنشاء حساب فوري عبر Google'
                          : 'المتابعة والدخول بحساب Google'}
                      </span>
                    </button>
                    <p className="text-center text-[11px] text-slate-400">
                      يتم حفظ معرف Google UID الحقيقي وربط الحساب بقاعدة بيانات Firestore تلقائياً.
                    </p>
                  </div>
                )}

                {/* الطريقة 2: البريد وكلمة المرور (دخول / تسجيل يدوي) */}
                {method === 'email' && mode === 'login' && (
                  <form onSubmit={handleEmailLogin} className="space-y-3 pt-2">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        البريد الإلكتروني
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        كلمة المرور
                      </label>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full py-2.5 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isBusy ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
                    </button>
                  </form>
                )}

                {/* التسجيل اليدوي الكامل */}
                {method === 'email' && mode === 'register' && (
                  <form onSubmit={handleManualRegister} className="space-y-3 pt-2">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        الاسم الكامل
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="مثال: أحمد محمد علي"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        رقم الهاتف (اختياري)
                      </label>
                      <input
                        type="tel"
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        البريد الإلكتروني
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          كلمة المرور
                        </label>
                        <input
                          type="password"
                          required
                          dir="ltr"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="6 أحرف فأكثر"
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          تأكيد كلمة المرور
                        </label>
                        <input
                          type="password"
                          required
                          dir="ltr"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="تطابق كلمة المرور"
                          className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isBusy ? 'جارٍ تسجيل الحساب...' : 'إنشاء الحساب (مندوب)'}
                    </button>
                  </form>
                )}

                {/* الطريقة 3: الهاتف ورمز التحقق SMS OTP */}
                {method === 'phone' && mode !== 'forgot_password' && (
                  <div className="space-y-3 pt-2">
                    {!otpSent ? (
                      <form onSubmit={handleSendPhoneOtp} className="space-y-3">
                        {mode === 'register' && (
                          <div>
                            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                              الاسم الكامل
                            </label>
                            <input
                              type="text"
                              required
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="اسم المندوب"
                              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                            />
                          </div>
                        )}
                        <div>
                          <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            رقم الهاتف مع كود الدولة
                          </label>
                          <input
                            type="tel"
                            required
                            dir="ltr"
                            value={phoneForOtp}
                            onChange={(e) => setPhoneForOtp(e.target.value)}
                            placeholder="+201012345678"
                            className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                          <span className="text-[10px] text-slate-400 block mt-1">
                            سيتم إرسال رمز تحقق حقيقي في رسالة SMS عبر Firebase.
                          </span>
                        </div>
                        <button
                          type="submit"
                          disabled={isBusy}
                          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isBusy ? 'جارٍ إرسال الرمز...' : 'إرسال رمز التحقق SMS'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyPhoneOtp} className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="font-bold text-slate-700 dark:text-slate-300">
                              رمز التحقق (OTP)
                            </label>
                            <button
                              type="button"
                              onClick={() => setOtpSent(false)}
                              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              تعديل رقم الهاتف
                            </button>
                          </div>
                          <input
                            type="text"
                            required
                            dir="ltr"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder="123456"
                            maxLength={6}
                            className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isBusy}
                          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isBusy ? 'جارٍ التحقق...' : 'تأكيد الرمز وتفعيل الدخول'}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* استعادة كلمة المرور */}
                {mode === 'forgot_password' && (
                  <form onSubmit={handleResetPassword} className="space-y-3 pt-2">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        البريد الإلكتروني المسجل
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isBusy ? 'جارٍ الإرسال...' : 'إرسال رابط إعادة التعيين'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="w-full py-1 text-center text-[11px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      الرجوع لتسجيل الدخول
                    </button>
                  </form>
                )}
              </>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-center">
              جميع الحسابات محمية بنظام الصلاحيات المتقدم وقواعد Cloud Firestore بدون محاكاة أو بيانات وهمية.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
