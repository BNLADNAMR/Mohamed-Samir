import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

export type OverlayBackCloseHandler = () => void;

interface OverlayEntry {
  id: symbol;
  onClose: OverlayBackCloseHandler;
}

const activeOverlayStack: OverlayEntry[] = [];

/**
 * يسجّل نافذة منبثقة أو بطاقة عائمة في مكدس LIFO بحيث يغلقها زر الرجوع في أندرويد أولاً
 * قبل الانتقال للشاشة السابقة.
 */
export function registerOverlayBackHandler(
  onClose: OverlayBackCloseHandler
): () => void {
  const entry: OverlayEntry = {
    id: Symbol('overlay_back_handler'),
    onClose,
  };
  activeOverlayStack.push(entry);

  return () => {
    const idx = activeOverlayStack.findIndex((item) => item.id === entry.id);
    if (idx !== -1) {
      activeOverlayStack.splice(idx, 1);
    }
  };
}

/**
 * يغلق أحدث نافذة منبثقة مفتوحة إن وجدت، ويعيد true إذا تم الإغلاق بنجاح.
 */
export function popTopOverlayBackHandler(): boolean {
  if (activeOverlayStack.length === 0) {
    return false;
  }
  const top = activeOverlayStack.pop();
  if (!top) {
    return false;
  }
  top.onClose();
  return true;
}

export function getActiveOverlayCount(): number {
  return activeOverlayStack.length;
}

export function resetOverlayStackForTests(): void {
  activeOverlayStack.length = 0;
}

/**
 * خطاف React لتسجيل أي نافذة منبثقة مفتوحة تلقائياً في مكدس زر الرجوع على أندرويد والويب.
 */
export function useOverlayBackHandler(
  isOpen: boolean,
  onClose: OverlayBackCloseHandler
): void {
  const latestCloseRef = useRef<OverlayBackCloseHandler>(onClose);
  latestCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    return registerOverlayBackHandler(() => {
      latestCloseRef.current();
    });
  }, [isOpen]);
}

export interface AndroidRootBackResolution {
  action: 'handled_step' | 'warn_double_press' | 'minimize_app';
  nextLastRootPressAtMs: number;
}

export const ANDROID_EXIT_DOUBLE_PRESS_WINDOW_MS = 2200;

/**
 * دالة منطقية حتمية لتحديد سلوك زر الرجوع في أندرويد:
 * 1) إذا نجحت خطوة إغلاق نافذة أو رجوع لشاشة سابقة -> handled_step
 * 2) إذا كنا في جذر التطبيق تماماً -> تتطلب ضغطتين متتاليتين خلال 2.2 ثانية لمنع الخروج المفاجئ
 */
export function resolveAndroidBackPressOutcome(params: {
  didStepBackOrCloseOverlay: boolean;
  nowMs: number;
  lastRootPressAtMs: number;
  doublePressWindowMs?: number;
}): AndroidRootBackResolution {
  const {
    didStepBackOrCloseOverlay,
    nowMs,
    lastRootPressAtMs,
    doublePressWindowMs = ANDROID_EXIT_DOUBLE_PRESS_WINDOW_MS,
  } = params;

  if (didStepBackOrCloseOverlay) {
    return {
      action: 'handled_step',
      nextLastRootPressAtMs: 0,
    };
  }

  if (
    lastRootPressAtMs > 0 &&
    nowMs - lastRootPressAtMs <= doublePressWindowMs
  ) {
    return {
      action: 'minimize_app',
      nextLastRootPressAtMs: 0,
    };
  }

  return {
    action: 'warn_double_press',
    nextLastRootPressAtMs: nowMs,
  };
}

export function isAndroidNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * يربط زر الرجوع الفعلي في أجهزة أندرويد (Hardware Back Button / Predictive Back Gesture)
 * بمنطق إغلاق النوافذ والتنقل الداخلي دون أي تأثير على متصفح الويب.
 */
export function useAndroidHardwareBackButton(params: {
  onStepBackOrCloseOverlay: () => boolean;
  onShowExitConfirmHint: () => void;
}): void {
  const { onStepBackOrCloseOverlay, onShowExitConfirmHint } = params;
  const stepHandlerRef = useRef(onStepBackOrCloseOverlay);
  const hintHandlerRef = useRef(onShowExitConfirmHint);
  const lastRootPressRef = useRef<number>(0);

  stepHandlerRef.current = onStepBackOrCloseOverlay;
  hintHandlerRef.current = onShowExitConfirmHint;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let isDisposed = false;
    let removeListener: (() => Promise<void>) | null = null;

    void CapacitorApp.addListener('backButton', () => {
      if (isDisposed) return;

      // أولاً: إغلاق أي نافذة فرعية مسجلة في المكدس
      const closedRegisteredOverlay = popTopOverlayBackHandler();
      const didStep =
        closedRegisteredOverlay || stepHandlerRef.current();

      const outcome = resolveAndroidBackPressOutcome({
        didStepBackOrCloseOverlay: didStep,
        nowMs: Date.now(),
        lastRootPressAtMs: lastRootPressRef.current,
      });

      lastRootPressRef.current = outcome.nextLastRootPressAtMs;

      if (outcome.action === 'warn_double_press') {
        hintHandlerRef.current();
      } else if (outcome.action === 'minimize_app') {
        void CapacitorApp.minimizeApp().catch(() => {
          void CapacitorApp.exitApp();
        });
      }
    }).then((handle) => {
      if (isDisposed) {
        void handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    });

    return () => {
      isDisposed = true;
      if (removeListener) {
        void removeListener();
      }
    };
  }, []);
}
