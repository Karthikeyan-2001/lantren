/**
 * Keeps the screen on during a focus session. On Android this is a window flag set by
 * the keep-awake plugin; in a browser it is the Screen Wake Lock API. This is the only
 * module that touches either.
 */
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

export interface Awake {
  /** Says whether the screen should stay on. Safe to call again and again. */
  set(on: boolean): void;
}

export function createAwake(): Awake {
  let sentinel: WakeLockSentinel | null = null;

  async function apply(on: boolean): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
      return;
    }
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (!on) {
      const held = sentinel;
      sentinel = null;
      await held?.release();
      return;
    }
    // The browser drops the lock whenever the page is hidden, so it is asked for again on return.
    if ((!sentinel || sentinel.released) && document.visibilityState === 'visible') {
      sentinel = await navigator.wakeLock.request('screen');
    }
  }

  return {
    set(on) {
      // Not supported, not allowed, or low battery: the session carries on without it.
      void apply(on).catch(() => undefined);
    },
  };
}
