/**
 * What the Progress screen and the Today ring show, as pure functions over the stored
 * data. Days are local calendar dates, worked out with the scheduler's date helpers, so a
 * session at 23:50 belongs to that evening and not to the UTC day. No React, no storage.
 */
import type { FocusSession, Review, Topic, Track, TrackColour } from '../data/types';
import { addDays, daysBetween, startOfWeek, toLocalDate, type LocalDate } from '../scheduler';

export const HEATMAP_WEEKS = 12;
export const COMPLETION_WINDOW_DAYS = 28;

/** The local date an ISO instant falls on, or null if the text is not a time. */
function dayOf(iso: string): LocalDate | null {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : toLocalDate(at);
}

/**
 * How many things were done on each day: topics studied, reviews completed and focus
 * sessions finished. A day with any of them is a study day.
 */
export function activityByDay(
  topics: readonly Pick<Topic, 'studiedOn'>[],
  reviews: readonly Pick<Review, 'doneAt'>[],
  sessions: readonly Pick<FocusSession, 'startedAt' | 'focusedMinutes'>[],
): Map<LocalDate, number> {
  const days = new Map<LocalDate, number>();
  const add = (day: LocalDate | null) => {
    if (day) days.set(day, (days.get(day) ?? 0) + 1);
  };
  for (const topic of topics) add(topic.studiedOn);
  for (const review of reviews) if (review.doneAt) add(dayOf(review.doneAt));
  for (const session of sessions) if (session.focusedMinutes >= 1) add(dayOf(session.startedAt));
  return days;
}

/* ---------- Streak ---------- */

export interface Streak {
  /** Study days in a row, not counting rest days. */
  days: number;
  todayDone: boolean;
  /** This week's rest day has not been used yet. */
  restAvailable: boolean;
}

/**
 * A gentle streak. Each Monday-to-Sunday week has one rest day: the first day missed in a
 * week while a streak is running is forgiven, and a second one ends the streak. Today does
 * not count against it until it is over, so the streak shown in the morning is
 * yesterday's.
 */
export function streakFor(active: ReadonlySet<LocalDate>, today: LocalDate): Streak {
  const done = [...active].filter((d) => d <= today).sort();
  const first = done[0];
  const todayDone = active.has(today);
  const thisWeek = startOfWeek(today);
  if (!first) return { days: 0, todayDone: false, restAvailable: true };

  const last = todayDone ? today : addDays(today, -1);
  let days = 0;
  let restWeek: LocalDate | null = null;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (active.has(day)) {
      days++;
    } else if (days > 0) {
      // Only a running streak has anything to protect.
      const week = startOfWeek(day);
      if (restWeek === week) days = 0;
      else restWeek = week;
    }
  }
  return { days, todayDone, restAvailable: restWeek !== thisWeek };
}

/* ---------- Heatmap ---------- */

export interface HeatCell {
  date: LocalDate;
  count: number;
  /** 0 nothing, 1 a little, 2 some, 3 a lot. */
  level: 0 | 1 | 2 | 3;
  future: boolean;
}

export interface Heatmap {
  /** Oldest first, seven to a week from Monday to Sunday, ending with this week. */
  cells: HeatCell[];
  weeks: number;
  studiedDays: number;
}

const levelFor = (count: number): HeatCell['level'] => (count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3);

export function heatmap(
  activity: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
  weeks: number = HEATMAP_WEEKS,
): Heatmap {
  const start = addDays(startOfWeek(today), -7 * (weeks - 1));
  const cells: HeatCell[] = [];
  let studiedDays = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    const future = date > today;
    const count = future ? 0 : (activity.get(date) ?? 0);
    if (count > 0) studiedDays++;
    cells.push({ date, count, level: levelFor(count), future });
  }
  return { cells, weeks, studiedDays };
}

/* ---------- Weekly focus ---------- */

export interface TrackWeek {
  trackId: string;
  name: string;
  colour: TrackColour;
  minutes: number;
  targetMinutes: number;
}

export interface WeekFocus {
  weekStart: LocalDate;
  /** Every track in view, in order, including those with nothing yet. */
  tracks: TrackWeek[];
  /** Focused minutes on tracks that are archived or gone, or on no track. */
  otherMinutes: number;
  totalMinutes: number;
  /** The targets of the tracks in view, added up. */
  totalTargetMinutes: number;
}

/** Focused minutes this week, Monday to today, against each track's weekly target. */
export function weeklyFocus(
  sessions: readonly Pick<FocusSession, 'startedAt' | 'focusedMinutes' | 'trackId'>[],
  tracks: readonly Track[],
  today: LocalDate,
): WeekFocus {
  const weekStart = startOfWeek(today);
  const live = tracks.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const byTrack = new Map<string, number>();
  let total = 0;
  for (const session of sessions) {
    const day = dayOf(session.startedAt);
    if (!day || day < weekStart || day > today) continue;
    total += session.focusedMinutes;
    if (session.trackId) byTrack.set(session.trackId, (byTrack.get(session.trackId) ?? 0) + session.focusedMinutes);
  }
  const rows = live.map((t) => ({
    trackId: t.id,
    name: t.name,
    colour: t.colour,
    minutes: byTrack.get(t.id) ?? 0,
    targetMinutes: t.weeklyTargetMinutes,
  }));
  const inView = rows.reduce((sum, r) => sum + r.minutes, 0);
  return {
    weekStart,
    tracks: rows,
    otherMinutes: total - inView,
    totalMinutes: total,
    totalTargetMinutes: rows.reduce((sum, r) => sum + r.targetMinutes, 0),
  };
}

/* ---------- Reviews ---------- */

export interface Completion {
  /** Reviews that have come due in the window. */
  due: number;
  done: number;
  /** 0 to 1, or null when nothing has come due yet. */
  rate: number | null;
}

/**
 * How many of the reviews that came due in the last four weeks have been done, late ones
 * included. A review due today and still open is not counted: it has not been missed.
 */
export function reviewCompletion(
  reviews: readonly Review[],
  topics: readonly Pick<Topic, 'id' | 'status'>[],
  today: LocalDate,
  windowDays: number = COMPLETION_WINDOW_DAYS,
): Completion {
  const live = new Set(topics.filter((t) => t.status !== 'archived').map((t) => t.id));
  let due = 0;
  let done = 0;
  for (const review of reviews) {
    if (!live.has(review.topicId)) continue;
    const age = daysBetween(review.dueOn, today);
    if (age < 0 || age >= windowDays) continue;
    if (age === 0 && !review.doneAt) continue;
    due++;
    if (review.doneAt) done++;
  }
  return { due, done, rate: due > 0 ? done / due : null };
}

export const lockedCount = (topics: readonly Pick<Topic, 'status'>[]): number =>
  topics.filter((t) => t.status === 'locked').length;
