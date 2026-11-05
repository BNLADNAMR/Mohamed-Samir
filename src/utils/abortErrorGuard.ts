/**
 * فحص دقيق وآمن لتحديد ما إذا كان الخطأ ناتجاً فقط عن إلغاء طلب متصفح عابر
 * (مثل "The user aborted a request." أو AbortError أثناء تحديث الإطار أو تبديل الجلسة)
 * مع ضمان عدم إخفاء أي أخطاء صلاحيات Firestore أو أخطاء برمجية حقيقية.
 */
export function isBenignAbortError(error: unknown): boolean {
  if (!error) return false;

  const extractFields = (
    input: unknown
  ): { name: string; code: string | number; message: string } => {
    if (typeof input === 'string') {
      return { name: '', code: '', message: input };
    }
    if (typeof input === 'object' && input !== null) {
      const rec = input as {
        name?: unknown;
        code?: unknown;
        message?: unknown;
        error?: unknown;
      };
      const name = typeof rec.name === 'string' ? rec.name : '';
      const code =
        typeof rec.code === 'string' || typeof rec.code === 'number'
          ? rec.code
          : '';
      const message =
        typeof rec.message === 'string'
          ? rec.message
          : typeof rec.error === 'string'
          ? rec.error
          : '';
      return { name, code, message };
    }
    return { name: '', code: '', message: String(input) };
  };

  const { name, code, message } = extractFields(error);
  const lowerName = name.toLowerCase();
  const lowerCode = String(code).toLowerCase();
  const lowerMessage = message.toLowerCase();

  // عدم إخفاء أي أخطاء صلاحيات أو حصص أو اتصال بقاعدة البيانات نهائياً
  if (
    lowerCode.includes('permission-denied') ||
    lowerCode.includes('resource-exhausted') ||
    lowerCode.includes('unauthenticated') ||
    lowerCode.includes('unauthorized-domain') ||
    lowerMessage.includes('missing or insufficient permissions') ||
    lowerMessage.includes('permission-denied') ||
    lowerMessage.includes('quota exceeded') ||
    lowerMessage.includes('the client is offline')
  ) {
    return false;
  }

  // 1. معيار DOMException القياسي في المتصفح (AbortError / code 20)
  if (lowerName === 'aborterror' || code === 20) {
    return true;
  }

  // 2. رموز الإلغاء العابرة في Firebase Auth / Firestore عند إغلاق قناة الاستماع أو تكرار النافذة
  if (
    lowerCode === 'cancelled' ||
    lowerCode === 'firestore/cancelled' ||
    lowerCode === 'auth/cancelled-popup-request'
  ) {
    return true;
  }

  // 3. رسائل إلغاء طلبات الشبكة القياسية في متصفحات Chromium و WebKit و Gecko
  if (
    lowerMessage.includes('the user aborted a request') ||
    lowerMessage.includes('signal is aborted') ||
    lowerMessage.includes('the operation was aborted') ||
    lowerMessage.includes('this operation was aborted') ||
    lowerMessage.includes('aborted without reason') ||
    lowerMessage.includes('request aborted') ||
    lowerMessage.includes('fetch is aborted')
  ) {
    return true;
  }

  // 4. أخطاء محاولة إضافات المتصفح الخارجية الكتابة فوق خاصية window.fetch المعرفة بـ getter فقط
  if (
    lowerMessage.includes(
      'cannot set property fetch of #<window> which has only a getter'
    ) ||
    lowerMessage.includes("cannot assign to read only property 'fetch'")
  ) {
    return true;
  }

  return false;
}

/**
 * التحقق مما إذا كان الخطأ صادراً بالكامل من إضافة متصفح خارجية (chrome-extension:// أو moz-extension://)
 * ولا ينتمي لكود التطبيق
 */
export function isExternalBrowserExtensionError(
  error: unknown,
  filename?: string
): boolean {
  const cleanFile = (filename || '').trim().toLowerCase();
  if (
    cleanFile.startsWith('chrome-extension://') ||
    cleanFile.startsWith('moz-extension://') ||
    cleanFile.startsWith('safari-extension://') ||
    cleanFile.startsWith('safari-web-extension://')
  ) {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const stack = String((error as { stack?: unknown }).stack || '').toLowerCase();
    if (
      stack.includes('chrome-extension://') ||
      stack.includes('moz-extension://') ||
      stack.includes('safari-extension://')
    ) {
      const appOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin.toLowerCase()
          : '';
      if (!appOrigin || !stack.includes(appOrigin)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * تحصين خاصية fetch على كائن النافذة إذا كانت معرفة بـ getter فقط دون setter،
 * حتى لا تتسبب إضافات المتصفح الخارجية (مثل Similarweb / Ant) في رمي TypeError عند تحميل الصفحة.
 */
export function ensureWindowFetchSetterSafe(targetObj: object = typeof window !== 'undefined' ? window : {}): boolean {
  try {
    const desc = Object.getOwnPropertyDescriptor(targetObj, 'fetch');
    if (
      desc &&
      typeof desc.get === 'function' &&
      typeof desc.set !== 'function' &&
      desc.configurable !== false
    ) {
      const origGetter = desc.get;
      Object.defineProperty(targetObj, 'fetch', {
        configurable: true,
        enumerable: desc.enumerable !== false,
        get() {
          return origGetter.call(targetObj);
        },
        set() {
          // تجاهل محاولة الإضافة الخارجية الكتابة فوق fetch مع الإبقاء على الدالة الأصلية سليمة
        },
      });
      return true;
    }
  } catch {
    // في حال كانت الخاصية غير قابلة لإعادة التعريف نتجاهل بهدوء ويتولى معالج الخطأ العام الحماية
  }
  return false;
}

declare global {
  interface Window {
    __shiftTrackerAbortGuardInstalled?: boolean;
  }
}

/**
 * تثبيت حارس عام مبكر لمنع ظهور أخطاء الإلغاء العابرة (AbortError) أو أخطاء إضافات المتصفح الخارجية
 * كأخطاء غير معالجة أثناء إعادة تحميل إطار المعاينة أو إغلاق قنوات البث اللحظي.
 */
export function installGlobalAbortErrorGuard(): void {
  if (typeof window === 'undefined' || window.__shiftTrackerAbortGuardInstalled) {
    return;
  }
  window.__shiftTrackerAbortGuardInstalled = true;

  ensureWindowFetchSetterSafe(window);

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (
        isBenignAbortError(event.reason) ||
        isExternalBrowserExtensionError(event.reason)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true }
  );

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const candidate = event.error ?? event.message;
      if (
        isBenignAbortError(candidate) ||
        isExternalBrowserExtensionError(candidate, event.filename)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true }
  );
}

