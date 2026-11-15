/**
 * Keeps the phone's scheduled notifications equal to the plan. Each run throws away
 * whatever was scheduled and schedules the fresh plan, so there is no drift to repair.
 */
import { toLocalDate } from '../scheduler';

import { planReminders, type PlanInput, type WallClock } from './plan';
import type { OutgoingReminder, ReminderPermission, ReminderPort } from './port';

const pad = (n: number) => String(n).padStart(2, '0');

/** What the wall calendar and clock show at this instant, in the device zone. */
export function wallClock(instant: Date): WallClock {
  return { date: toLocalDate(instant), time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}` };
}

/**
 * The instant at which the device's wall clock will show this date and time. Built from
 * calendar fields, not by adding milliseconds, so it lands on the right local time
 * across daylight-saving changes. Redone whenever the device zone changes.
 */
export function toInstant(at: WallClock): Date {
  const [year, month, day] = at.date.split('-').map(Number);
  const [hour, minute] = at.time.split(':').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0, 0);
}

/** Changes when the device zone, its offset, or the local date changes. */
export function clockKey(instant: Date): string {
  return `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${instant.getTimezoneOffset()}|${toLocalDate(instant)}`;
}

export type SyncState = Omit<PlanInput, 'now'>;

export interface SyncResult {
  permission: ReminderPermission;
  scheduled: number;
}

export async function syncReminders(port: ReminderPort, state: SyncState, now: Date): Promise<SyncResult> {
  const permission = await port.permission();
  if (permission === 'unsupported') return { permission, scheduled: 0 };

  const outgoing: OutgoingReminder[] =
    permission === 'granted'
      ? planReminders({ ...state, now: wallClock(now) })
          .map((r) => ({ id: r.id, at: toInstant(r.at), title: r.title, body: r.body, reviewId: r.reviewId }))
          .filter((r) => r.at.getTime() > now.getTime())
      : [];
  await port.replaceAll(outgoing);
  return { permission, scheduled: outgoing.length };
}

/**
 * Runs syncs one at a time. A request made while one is running is folded into a single
 * follow-up run with the latest state, so quick edits cannot interleave cancel and schedule.
 */
export function createReminderSync(
  port: ReminderPort,
  read: () => SyncState | null,
  clock: () => Date = () => new Date(),
) {
  let busy = false;
  let again = false;
  let current: Promise<void> = Promise.resolve();

  const run = async () => {
    do {
      again = false;
      const state = read();
      if (!state) continue;
      try {
        await syncReminders(port, state, clock());
      } catch (error) {
        console.warn('Lantern could not update its reminders', error);
      }
    } while (again);
    // Cleared in the same tick the loop ends, so a request can never slip between the two.
    busy = false;
  };

  return {
    /** Ask for a sync. Resolves when the state at the time of asking has been applied. */
    request(): Promise<void> {
      if (busy) {
        again = true;
      } else {
        busy = true;
        current = run();
      }
      return current;
    },
  };
}
