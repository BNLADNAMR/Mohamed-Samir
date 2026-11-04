import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANDROID_EXIT_DOUBLE_PRESS_WINDOW_MS,
  getActiveOverlayCount,
  popTopOverlayBackHandler,
  registerOverlayBackHandler,
  resetOverlayStackForTests,
  resolveAndroidBackPressOutcome,
} from '../utils/androidBackBridge';

describe('Android Back Button Bridge & LIFO Overlay Close Stack', () => {
  beforeEach(() => {
    resetOverlayStackForTests();
  });

  it('closes open modals/cards in LIFO (last-opened-first-closed) order before screen navigation', () => {
    const closedOrder: string[] = [];

    const unsubFirst = registerOverlayBackHandler(() => {
      closedOrder.push('modal_base');
    });
    registerOverlayBackHandler(() => {
      closedOrder.push('nested_card');
    });

    expect(getActiveOverlayCount()).toBe(2);

    // First back press closes the nested card on top
    expect(popTopOverlayBackHandler()).toBe(true);
    expect(closedOrder).toEqual(['nested_card']);
    expect(getActiveOverlayCount()).toBe(1);

    // Unregistering manually removes remaining overlay cleanly
    unsubFirst();
    expect(getActiveOverlayCount()).toBe(0);
    expect(popTopOverlayBackHandler()).toBe(false);
  });

  it('prevents abrupt app exit at root screen and requires double-press within window', () => {
    // 1. Stepping back through an open modal or previous screen resets root timer
    const stepOutcome = resolveAndroidBackPressOutcome({
      didStepBackOrCloseOverlay: true,
      nowMs: 10_000,
      lastRootPressAtMs: 9_500,
    });
    expect(stepOutcome).toEqual({
      action: 'handled_step',
      nextLastRootPressAtMs: 0,
    });

    // 2. First press at root home shows confirmation hint instead of exiting abruptly
    const firstRootPress = resolveAndroidBackPressOutcome({
      didStepBackOrCloseOverlay: false,
      nowMs: 20_000,
      lastRootPressAtMs: 0,
    });
    expect(firstRootPress).toEqual({
      action: 'warn_double_press',
      nextLastRootPressAtMs: 20_000,
    });

    // 3. Second press within 2200ms minimizes the app smoothly
    const secondRootPressWithinWindow = resolveAndroidBackPressOutcome({
      didStepBackOrCloseOverlay: false,
      nowMs: 20_000 + ANDROID_EXIT_DOUBLE_PRESS_WINDOW_MS - 200,
      lastRootPressAtMs: firstRootPress.nextLastRootPressAtMs,
    });
    expect(secondRootPressWithinWindow).toEqual({
      action: 'minimize_app',
      nextLastRootPressAtMs: 0,
    });

    // 4. Second press AFTER window expired warns again instead of exiting unexpectedly
    const latePressAfterWindow = resolveAndroidBackPressOutcome({
      didStepBackOrCloseOverlay: false,
      nowMs: 20_000 + ANDROID_EXIT_DOUBLE_PRESS_WINDOW_MS + 500,
      lastRootPressAtMs: firstRootPress.nextLastRootPressAtMs,
    });
    expect(latePressAfterWindow).toEqual({
      action: 'warn_double_press',
      nextLastRootPressAtMs: 20_000 + ANDROID_EXIT_DOUBLE_PRESS_WINDOW_MS + 500,
    });
  });
});
