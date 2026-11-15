/**
 * The focus timer's rules, as pure functions over a `FocusRun`. Time is always passed
 * in as epoch milliseconds, so the timer follows the wall clock and stays right when
 * the app is throttled, hidden or restarted. No React, no storage, no audio.
 */
import { FOCUS } from './config';

export interface FocusRun {
  id: string;
  startedAt: number;
  plannedMs: number;
  /** Timer time used up before the current running stretch. */
  bankedMs: number;
  /** When the current running stretch began. Null while paused. */
  runningSince: number | null;
  /** Timer time that passed while the app was out of sight. */
  awayMs: number;
  /** When the app went out of sight during a running stretch, if it is away now. */
  awaySince: number | null;
  /** When the user last came back from a counted absence. */
  returnedAt: number | null;
  interruptions: number;
  parkingLot: string[];
  topicId?: string;
  trackId?: string;
}

/** What a finished run becomes. Same shape as `FocusSession` in the data model. */
export interface FinishedFocus {
  id: string;
  startedAt: string;
  endedAt: string;
  plannedMinutes: number;
  focusedMinutes: number;
  topicId?: string;
  trackId?: string;
  interruptions: number;
  parkingLot: string[];
}

export interface FocusResult {
  session: FinishedFocus;
  /** True when the timer reached zero, false when the user stopped early. */
  completed: boolean;
}

const MINUTE = 60_000;

export function startRun(
  now: number,
  options: { id: string; minutes: number; topicId?: string; trackId?: string },
): FocusRun {
  return {
    id: options.id,
    startedAt: now,
    plannedMs: Math.round(options.minutes * MINUTE),
    bankedMs: 0,
    runningSince: now,
    awayMs: 0,
    awaySince: null,
    returnedAt: null,
    interruptions: 0,
    parkingLot: [],
    topicId: options.topicId,
    trackId: options.trackId,
  };
}

export const isPaused = (run: FocusRun): boolean => run.runningSince === null;

/** Timer time used so far, never more than was planned and never negative. */
export function elapsedMs(run: FocusRun, now: number): number {
  const stretch = run.runningSince === null ? 0 : Math.max(0, now - run.runningSince);
  return Math.min(run.plannedMs, run.bankedMs + stretch);
}

export const remainingMs = (run: FocusRun, now: number): number => run.plannedMs - elapsedMs(run, now);

export const isOver = (run: FocusRun, now: number): boolean => remainingMs(run, now) <= 0;

/** The instant the timer reaches zero if nothing changes. Null while paused. */
export function endsAt(run: FocusRun): number | null {
  return run.runningSince === null ? null : run.runningSince + (run.plannedMs - run.bankedMs);
}

/** Closes an absence: counts it as an interruption unless it was only a glance. */
function settleAway(run: FocusRun, now: number): FocusRun {
  if (run.awaySince === null) return run;
  if (now - run.awaySince < FOCUS.AWAY_GRACE_MS) return { ...run, awaySince: null };
  // Only time the timer was still running counts as away: nothing after it reached zero.
  const until = Math.min(now, endsAt(run) ?? now);
  return {
    ...run,
    awaySince: null,
    awayMs: run.awayMs + Math.max(0, until - run.awaySince),
    interruptions: run.interruptions + 1,
    returnedAt: now,
  };
}

/** The app went out of sight. Only matters while the timer is running. */
export function leave(run: FocusRun, now: number): FocusRun {
  if (run.runningSince === null || run.awaySince !== null || isOver(run, now)) return run;
  return { ...run, awaySince: now };
}

/** The app is in front again. */
export const comeBack = (run: FocusRun, now: number): FocusRun => settleAway(run, now);

export function pause(run: FocusRun, now: number): FocusRun {
  if (run.runningSince === null) return run;
  const settled = settleAway(run, now);
  return { ...settled, bankedMs: elapsedMs(settled, now), runningSince: null };
}

export function resume(run: FocusRun, now: number): FocusRun {
  return run.runningSince === null ? { ...run, runningSince: now } : run;
}

/** Adds a stray thought to the parking lot. Blank thoughts are dropped. */
export function park(run: FocusRun, thought: string): FocusRun {
  const text = thought.trim();
  return text ? { ...run, parkingLot: [...run.parkingLot, text] } : run;
}

/**
 * Ends the run, whether the timer reached zero or the user stopped early. Focused time is
 * timer time minus time away. A session that ran out while the app was closed ends at the
 * moment its timer reached zero, not now.
 */
export function finish(run: FocusRun, now: number): FocusResult {
  const settled = settleAway(run, now);
  const completed = isOver(settled, now);
  const endedAt = completed ? (endsAt(settled) ?? now) : now;
  return {
    completed,
    session: {
      id: settled.id,
      startedAt: new Date(settled.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      plannedMinutes: Math.round(settled.plannedMs / MINUTE),
      focusedMinutes: Math.floor(Math.max(0, elapsedMs(settled, now) - settled.awayMs) / MINUTE),
      topicId: settled.topicId,
      trackId: settled.trackId,
      interruptions: settled.interruptions,
      parkingLot: settled.parkingLot,
    },
  };
}

/** Whether a finished run is worth keeping: any completed one, or an early stop with real time in it. */
export const isKept = (result: FocusResult): boolean =>
  result.completed || result.session.focusedMinutes >= FOCUS.MIN_KEPT_MINUTES;

/**
 * Which break to suggest after a session: the long one after a long session or after
 * every fourth session finished today (counting this one), otherwise the short one.
 */
export function suggestBreak(plannedMinutes: number, finishedToday: number): number {
  const long =
    plannedMinutes >= FOCUS.LONG_BREAK_FROM_MINUTES ||
    (finishedToday > 0 && finishedToday % FOCUS.LONG_BREAK_EVERY === 0);
  return long ? FOCUS.LONG_BREAK_MINUTES : FOCUS.SHORT_BREAK_MINUTES;
}

export function isValidLength(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= FOCUS.CUSTOM_MIN_MINUTES && minutes <= FOCUS.CUSTOM_MAX_MINUTES;
}

/** "24:59". Rounds up, so the display reaches 00:00 exactly when the timer does. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** "18 minutes left", "1 minute left", "under a minute left": what a screen reader hears. */
export function spokenRemaining(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  if (minutes < 1) return 'under a minute left';
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
}

/* ---------- Keeping a running session across an app restart ---------- */

export interface StoredRun {
  run: FocusRun;
  /** The last moment the app is known to have been alive. */
  seenAt: number;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumberOrNull = (v: unknown): v is number | null => v === null || isNumber(v);
const isOptionalString = (v: unknown): v is string | undefined => v === undefined || typeof v === 'string';

/** Reads what `JSON.stringify` wrote for a `StoredRun`; null for anything that is not one. */
export function parseStoredRun(text: string | null): StoredRun | null {
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { run, seenAt } = value as { run?: unknown; seenAt?: unknown };
  if (typeof run !== 'object' || run === null || !isNumber(seenAt)) return null;
  const r = run as Record<string, unknown>;
  const lot = r.parkingLot;
  if (
    typeof r.id !== 'string' ||
    !isNumber(r.startedAt) ||
    !isNumber(r.plannedMs) ||
    r.plannedMs <= 0 ||
    !isNumber(r.bankedMs) ||
    !isNumberOrNull(r.runningSince) ||
    !isNumber(r.awayMs) ||
    !isNumberOrNull(r.awaySince) ||
    !isNumber(r.interruptions) ||
    !Array.isArray(lot) ||
    !lot.every((t): t is string => typeof t === 'string') ||
    !isOptionalString(r.topicId) ||
    !isOptionalString(r.trackId)
  ) {
    return null;
  }
  return {
    seenAt,
    run: {
      id: r.id,
      startedAt: r.startedAt,
      plannedMs: r.plannedMs,
      bankedMs: r.bankedMs,
      runningSince: r.runningSince,
      awayMs: r.awayMs,
      awaySince: r.awaySince,
      returnedAt: null,
      interruptions: r.interruptions,
      parkingLot: lot,
      topicId: r.topicId,
      trackId: r.trackId,
    },
  };
}

/**
 * Picks a stored run back up after the app was closed. If it was running and the app
 * vanished without saying so, it counts as having left when it was last seen.
 */
export function restoreRun(stored: StoredRun, now: number): FocusRun {
  const run = stored.run;
  const left = run.runningSince !== null && run.awaySince === null ? leave(run, Math.min(stored.seenAt, now)) : run;
  return comeBack(left, now);
}
