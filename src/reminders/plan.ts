/**
 * Decides which reminders should exist, as wall-clock moments ("2026-11-18 at 19:30").
 *
 * Pure: no Date, no timezone, no Capacitor. The caller says what the wall calendar and
 * wall clock show right now; turning a planned moment into an instant in the device
 * zone happens in sync.ts, at the last step. That is what keeps a reminder at 7:30 pm
 * local after a timezone change: the plan does not move, only its instants are redone.
 */
import { addDays, type LocalDate, type Review, type TopicStatus } from '../scheduler';

export const REMINDERS = {
  DEFAULT_TIME: '19:30',
  /** Rough time a review takes, for "about 12 minutes". */
  MINUTES_PER_REVIEW: 4,
  /** Re-solving a problem from scratch takes longer. */
  MINUTES_PER_PROBLEM: 10,
  /** Per-review reminders are planned this far ahead (day 30 is 29 days out). */
  REVIEW_HORIZON_DAYS: 30,
  /** Digests are planned for this many days; after a week unopened, Lantern goes quiet. */
  DIGEST_DAYS: 7,
  /** Well under Android's 500-alarm limit and iOS's 64. Soonest are kept. */
  MAX_PLANNED: 48,
} as const;

/** 24-hour wall-clock time, "HH:MM". */
export type ClockTime = string;

export interface WallClock {
  date: LocalDate;
  time: ClockTime;
}

export interface ReminderSettings {
  reminders: boolean;
  reminderTime: ClockTime;
  dailyDigest: boolean;
  quietHours: { start: ClockTime; end: ClockTime } | null;
}

/** The part of a topic the planner needs. */
export interface ReminderTopic {
  id: string;
  title: string;
  status: TopicStatus;
  kind: string;
}

export interface PlannedReminder {
  /** Stable 31-bit id (Android needs an int). */
  id: number;
  kind: 'review' | 'waiting' | 'digest';
  at: WallClock;
  title: string;
  body: string;
  /** Set when tapping should open one review; otherwise it opens Today. */
  reviewId?: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isClockTime = (value: unknown): value is ClockTime => typeof value === 'string' && TIME.test(value);

/** True when `time` falls inside the quiet window. The window may run past midnight. */
export function inQuietHours(time: ClockTime, quiet: ReminderSettings['quietHours']): boolean {
  if (!quiet || !isClockTime(quiet.start) || !isClockTime(quiet.end) || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? time >= quiet.start && time < quiet.end : time >= quiet.start || time < quiet.end;
}

export interface Delivery {
  time: ClockTime;
  /** 1 when quiet hours push the reminder to the next morning. */
  dayShift: 0 | 1;
  /** True when quiet hours moved it away from the chosen time. */
  moved: boolean;
}

/**
 * When a reminder for a given day is actually delivered. A reminder time inside quiet
 * hours waits until they end, even if that is the next morning.
 */
export function deliveryFor(settings: ReminderSettings): Delivery {
  const time = isClockTime(settings.reminderTime) ? settings.reminderTime : REMINDERS.DEFAULT_TIME;
  const quiet = settings.quietHours;
  if (!quiet || !inQuietHours(time, quiet)) return { time, dayShift: 0, moved: false };
  return { time: quiet.end, dayShift: quiet.end <= time ? 1 : 0, moved: true };
}

const stamp = (at: WallClock): string => `${at.date}T${at.time}`;

/** FNV-1a, folded to a positive 31-bit integer. */
function hashId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h & 0x7fffffff || 1;
}

const minutesFor = (topic: ReminderTopic): number =>
  topic.kind === 'dsa-problem' ? REMINDERS.MINUTES_PER_PROBLEM : REMINDERS.MINUTES_PER_REVIEW;

const reviewsWord = (n: number): string => (n === 1 ? '1 review' : `${n} reviews`);

export interface PlanInput {
  reviews: readonly Review[];
  topics: readonly ReminderTopic[];
  settings: ReminderSettings;
  /** What the wall calendar and clock show right now, in the device zone. */
  now: WallClock;
}

/**
 * The reminders that should be scheduled right now, soonest first.
 *
 * - Digest off: each open review reminds once, on its due day. Reviews whose moment has
 *   already passed share one "waiting for you" nudge at the next reminder time.
 * - Digest on: one line per day instead, counting everything waiting by then.
 *
 * It is planned as if nothing gets reviewed in between; the app plans again whenever
 * something does.
 */
export function planReminders({ reviews, topics, settings, now }: PlanInput): PlannedReminder[] {
  if (!settings.reminders) return [];

  const delivery = deliveryFor(settings);
  const slot = (day: LocalDate): WallClock => ({ date: addDays(day, delivery.dayShift), time: delivery.time });
  const ahead = (day: LocalDate): boolean => stamp(slot(day)) > stamp(now);

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const open: { review: Review; topic: ReminderTopic }[] = [];
  for (const review of reviews) {
    const topic = topicById.get(review.topicId);
    if (!review.doneAt && topic && topic.status !== 'archived') open.push({ review, topic });
  }
  open.sort((a, b) => a.review.dueOn.localeCompare(b.review.dueOn) || a.review.id.localeCompare(b.review.id));

  // The first day whose reminder moment is still ahead. Yesterday's can be, when quiet
  // hours push it to this morning; tomorrow's always is.
  const firstDay = [-1, 0, 1].map((n) => addDays(now.date, n)).find(ahead);
  if (!firstDay) return [];

  const planned: Omit<PlannedReminder, 'id'>[] = [];
  const keys: string[] = [];
  const add = (key: string, reminder: Omit<PlannedReminder, 'id'>) => {
    keys.push(key);
    planned.push(reminder);
  };
  const minutes = (items: typeof open) => items.reduce((sum, o) => sum + minutesFor(o.topic), 0);

  if (settings.dailyDigest) {
    for (let i = 0; i < REMINDERS.DIGEST_DAYS; i++) {
      const day = addDays(firstDay, i);
      const waiting = open.filter((o) => o.review.dueOn <= day);
      if (waiting.length === 0) continue;
      add(`digest:${day}`, {
        kind: 'digest',
        at: slot(day),
        title: `${reviewsWord(waiting.length)} waiting`,
        body: `About ${minutes(waiting)} minutes, whenever you are ready.`,
      });
    }
  } else {
    const waiting = open.filter((o) => o.review.dueOn < firstDay);
    const only = waiting.length === 1 ? waiting[0] : undefined;
    if (waiting.length > 0) {
      add(`waiting:${firstDay}`, {
        kind: 'waiting',
        at: slot(firstDay),
        title: only ? `“${only.topic.title}” is waiting for you` : `${reviewsWord(waiting.length)} waiting for you`,
        body: `About ${minutes(waiting)} minutes. No rush.`,
        reviewId: only?.review.id,
      });
    }
    const lastDay = addDays(now.date, REMINDERS.REVIEW_HORIZON_DAYS);
    for (const o of open) {
      if (o.review.dueOn < firstDay || o.review.dueOn > lastDay) continue;
      const what = o.review.dayMark === 'extra' ? 'One more look' : `Day ${o.review.dayMark} review`;
      add(`review:${o.review.id}`, {
        kind: 'review',
        at: slot(o.review.dueOn),
        title: o.topic.title,
        body: `${what}. About ${minutesFor(o.topic)} minutes.`,
        reviewId: o.review.id,
      });
    }
  }

  const used = new Set<number>();
  return planned
    .map((reminder, i) => {
      let id = hashId(keys[i] ?? String(i));
      while (used.has(id)) id = (id % 0x7fffffff) + 1;
      used.add(id);
      return { ...reminder, id };
    })
    .sort((a, b) => stamp(a.at).localeCompare(stamp(b.at)))
    .slice(0, REMINDERS.MAX_PLANNED);
}
