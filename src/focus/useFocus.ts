/** Where the focus timer meets the running app: the shared store, sound, and screen lock. */
import { useEffect, useState } from 'react';

import { newId } from '../data/ids';
import { useLantern } from '../data/store';
import type { Settings } from '../data/types';

import { createAwake } from './awake';
import { isPaused } from './session';
import { createAmbient } from './sound';
import { createFocusStore } from './store';

export const ambient = createAmbient();
const awake = createAwake();

export const useFocus = createFocusStore({
  now: () => Date.now(),
  newId,
  save: (session) => useLantern.getState().logFocus(session),
  storage: typeof localStorage === 'undefined' ? null : localStorage,
});

/** Makes sound and the screen lock match the session as it is right now. */
function reconcile(): void {
  const { phase, run } = useFocus.getState();
  const { focusSound, focusVolume } = useLantern.getState().settings;
  const running = phase === 'focus' && run !== null && !isPaused(run);
  awake.set(running);
  ambient.set({ kind: phase === 'focus' ? focusSound : 'off', volume: focusVolume, playing: running });
}

const soundChanged = (a: Settings, b: Settings): boolean =>
  a.focusSound !== b.focusSound || a.focusVolume !== b.focusVolume || a.focusSleepFade !== b.focusSleepFade;

/**
 * Mounted once, for the life of the app. Ticks the timer, logs leaving and returning,
 * keeps sound and the screen lock in step, and rings the chime when a timer ends.
 */
export function useFocusLifecycle(): void {
  useEffect(() => {
    const focus = useFocus.getState;
    focus().restore();

    const timer = window.setInterval(() => focus().tick(), 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') focus().leave();
      else {
        focus().comeBack();
        // The browser lets go of the screen lock while hidden.
        reconcile();
      }
    };
    const onPageHide = () => focus().leave();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    const unsubscribeFocus = useFocus.subscribe((s, prev) => {
      const { focusChime, focusSleepFade } = useLantern.getState().settings;
      if (s.phase === 'focus' && prev.phase !== 'focus') ambient.sleepAfter(focusSleepFade);
      const finished = prev.phase === 'focus' && s.phase === 'done' && s.completed;
      const breakOver = prev.phase === 'break' && s.phase === 'breakOver';
      if (s.phase !== prev.phase || s.run?.runningSince !== prev.run?.runningSince) reconcile();
      if (focusChime && (finished || breakOver)) ambient.chime();
    });
    const unsubscribeSettings = useLantern.subscribe((s, prev) => {
      if (!soundChanged(s.settings, prev.settings)) return;
      // Choosing a sound or a fade again starts the fade over, so a sound that has faded comes back.
      if (
        useFocus.getState().phase === 'focus' &&
        (s.settings.focusSound !== prev.settings.focusSound ||
          s.settings.focusSleepFade !== prev.settings.focusSleepFade)
      ) {
        ambient.sleepAfter(s.settings.focusSleepFade);
      }
      reconcile();
    });
    reconcile();

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      unsubscribeFocus();
      unsubscribeSettings();
    };
  }, []);
}

/** The current time, refreshed a few times a second while `active`, for drawing a countdown. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active]);
  return now;
}
