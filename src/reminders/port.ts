/**
 * The one place that talks to the notification system. Everything else sees this small
 * interface, so the planner and the sync can be tested without a phone.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** `unsupported`: this browser cannot show notifications at all. */
export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** `unavailable`: not Android, so there is no exact-alarm setting to speak of. */
export type ExactTiming = 'exact' | 'inexact' | 'unavailable';

export interface OutgoingReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
  reviewId?: string;
}

export interface ReminderPort {
  permission(): Promise<ReminderPermission>;
  /** Shows the system prompt (Android 13+, browsers) when it has not been answered yet. */
  requestPermission(): Promise<ReminderPermission>;
  exactTiming(): Promise<ExactTiming>;
  /** Opens Android's "Alarms & reminders" screen for Lantern. */
  openExactTimingSettings(): Promise<ExactTiming>;
  /** Cancels everything scheduled, clears what was delivered, and schedules `reminders`. */
  replaceAll(reminders: readonly OutgoingReminder[]): Promise<void>;
  /** Calls back when a reminder is tapped. Returns a function that stops listening. */
  onTap(handler: (target: { reviewId?: string }) => void): () => void;
}

const CHANNEL_ID = 'reviews';
const GROUP = 'lantern-reviews';

const toPermission = (state: string): ReminderPermission =>
  state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';

export function capacitorReminderPort(): ReminderPort {
  const android = Capacitor.getPlatform() === 'android';
  let channelReady: Promise<void> | null = null;

  // Android 8+ shows notifications through a channel the user can tune in system settings.
  const ensureChannel = (): Promise<void> => {
    if (!android) return Promise.resolve();
    channelReady ??= LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Review reminders',
      description: 'A gentle nudge when a review is due.',
      importance: 3,
      visibility: 1,
    }).catch((error: unknown) => {
      channelReady = null;
      throw error;
    });
    return channelReady;
  };

  const exactTiming = async (): Promise<ExactTiming> => {
    if (!android) return 'unavailable';
    try {
      const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
      return exact_alarm === 'granted' ? 'exact' : 'inexact';
    } catch {
      return 'inexact';
    }
  };

  return {
    async permission() {
      try {
        return toPermission((await LocalNotifications.checkPermissions()).display);
      } catch {
        return 'unsupported';
      }
    },

    async requestPermission() {
      try {
        return toPermission((await LocalNotifications.requestPermissions()).display);
      } catch {
        return 'unsupported';
      }
    },

    exactTiming,

    async openExactTimingSettings() {
      if (!android) return 'unavailable';
      const { exact_alarm } = await LocalNotifications.changeExactNotificationSetting();
      return exact_alarm === 'granted' ? 'exact' : 'inexact';
    },

    async replaceAll(reminders) {
      const { notifications: pending } = await LocalNotifications.getPending();
      if (pending.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
      }
      // The app is open, so whatever is sitting in the tray has been answered.
      await LocalNotifications.removeAllDeliveredNotifications().catch(() => undefined);
      if (reminders.length === 0) return;

      await ensureChannel();
      // Exact alarms only when Android already allows them. Asking for one without the
      // permission makes the plugin open a system settings screen on every schedule, so
      // the inexact fallback is chosen here, quietly.
      const exact = (await exactTiming()) === 'exact';
      await LocalNotifications.schedule({
        notifications: reminders.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          // allowWhileIdle lets the alarm through Doze, exact or not.
          schedule: { at: r.at, allowWhileIdle: true },
          isExactNotification: exact,
          channelId: android ? CHANNEL_ID : undefined,
          group: android ? GROUP : undefined,
          autoCancel: true,
          extra: { reviewId: r.reviewId ?? null },
        })),
      });
    },

    onTap(handler) {
      let stopped = false;
      const handle = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const extra: unknown = event.notification.extra;
        const reviewId =
          typeof extra === 'object' && extra !== null && 'reviewId' in extra && typeof extra.reviewId === 'string'
            ? extra.reviewId
            : undefined;
        handler({ reviewId });
      });
      void handle.then((h) => {
        if (stopped) void h.remove();
      });
      return () => {
        stopped = true;
        void handle.then((h) => h.remove());
      };
    },
  };
}
