/** Where reminders meet the running app: the shared port, the sync, and two hooks. */
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLantern } from '../data/store';
import type { Settings } from '../data/types';

import { capacitorReminderPort, type ExactTiming, type ReminderPermission } from './port';
import { clockKey, createReminderSync } from './sync';

export const reminderPort = capacitorReminderPort();

const reminderSync = createReminderSync(reminderPort, () => {
  const s = useLantern.getState();
  return s.status === 'ready' ? { reviews: s.reviews, topics: s.topics, settings: s.settings } : null;
});

/** Re-plan and re-schedule every reminder from what is stored right now. */
export const requestReminderSync = (): Promise<void> => reminderSync.request();

const reminderSettingsChanged = (a: Settings, b: Settings): boolean =>
  a.reminders !== b.reminders ||
  a.reminderTime !== b.reminderTime ||
  a.dailyDigest !== b.dailyDigest ||
  a.quietHours?.start !== b.quietHours?.start ||
  a.quietHours?.end !== b.quietHours?.end;

/**
 * Mounted once, inside the router. Reschedules reminders whenever topics, reviews or
 * reminder settings change, when the local date or the device timezone changes, and each
 * time the app comes back to the foreground. Opens the right screen when one is tapped.
 */
export function useReminderSync(): void {
  const navigate = useNavigate();

  useEffect(
    () => reminderPort.onTap(({ reviewId }) => navigate(reviewId ? `/review/${reviewId}` : '/today')),
    [navigate],
  );

  useEffect(() => {
    let key = clockKey(new Date());
    const unsubscribe = useLantern.subscribe((s, prev) => {
      if (s.status !== 'ready') return;
      if (
        prev.status !== 'ready' ||
        s.reviews !== prev.reviews ||
        s.topics !== prev.topics ||
        reminderSettingsChanged(s.settings, prev.settings)
      ) {
        void requestReminderSync();
      }
    });

    // A new local day or a new timezone moves every reminder's instant.
    const onTick = () => {
      const next = clockKey(new Date());
      if (next === key) return;
      key = next;
      void requestReminderSync();
    };
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      key = clockKey(new Date());
      void requestReminderSync();
    };
    const timer = window.setInterval(onTick, 60_000);
    document.addEventListener('visibilitychange', onForeground);
    const resume = Capacitor.isNativePlatform() ? CapacitorApp.addListener('resume', onForeground) : null;

    if (useLantern.getState().status === 'ready') void requestReminderSync();

    return () => {
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onForeground);
      void resume?.then((handle) => handle.remove());
    };
  }, []);
}

/**
 * Asks for notification permission and, if it is given, switches reminders on.
 * A "no" changes nothing; the caller decides what to say.
 */
export async function enableReminders(): Promise<ReminderPermission> {
  const permission = await reminderPort.requestPermission();
  if (permission === 'granted') {
    await useLantern.getState().updateSettings({ reminders: true, reminderOfferSeen: true });
  }
  return permission;
}

/** What the system currently allows. Re-checked on return from system settings. */
export function useReminderStatus() {
  // null until the first answer arrives.
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [exact, setExact] = useState<ExactTiming>('unavailable');

  const refresh = useCallback(async () => {
    const [nextPermission, nextExact] = await Promise.all([reminderPort.permission(), reminderPort.exactTiming()]);
    setPermission(nextPermission);
    setExact(nextExact);
  }, []);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [refresh]);

  return { permission, exact, refresh, native: Capacitor.isNativePlatform() };
}
