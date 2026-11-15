// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { FOCUS } from './config';
import {
  comeBack,
  elapsedMs,
  endsAt,
  finish,
  formatClock,
  isKept,
  isOver,
  isPaused,
  isValidLength,
  leave,
  parseStoredRun,
  park,
  pause,
  remainingMs,
  restoreRun,
  resume,
  spokenRemaining,
  startRun,
  suggestBreak,
} from './session';

const MIN = 60_000;
// Sunday 15 November 2026, 19:30 local.
const T0 = new Date(2026, 10, 15, 19, 30).getTime();
const begin = (minutes = 25) => startRun(T0, { id: 'run-1', minutes, topicId: 'topic-1', trackId: 'track-js' });

describe('the timer follows the wall clock', () => {
  test('counts down from the planned length', () => {
    const run = begin();
    expect(remainingMs(run, T0)).toBe(25 * MIN);
    expect(remainingMs(run, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(isOver(run, T0 + 25 * MIN - 1)).toBe(false);
    expect(isOver(run, T0 + 25 * MIN)).toBe(true);
    expect(endsAt(run)).toBe(T0 + 25 * MIN);
  });

  test('never runs past the planned length, however late it is checked', () => {
    const run = begin();
    expect(elapsedMs(run, T0 + 9 * 60 * MIN)).toBe(25 * MIN);
    expect(remainingMs(run, T0 + 9 * 60 * MIN)).toBe(0);
  });

  test('a clock that jumps backwards never gives negative time', () => {
    const run = begin();
    expect(elapsedMs(run, T0 - 5 * MIN)).toBe(0);
    expect(remainingMs(run, T0 - 5 * MIN)).toBe(25 * MIN);
  });
});

describe('pause and resume', () => {
  test('a pause holds the timer; resuming carries on from where it stopped', () => {
    const paused = pause(begin(), T0 + 10 * MIN);
    expect(isPaused(paused)).toBe(true);
    expect(endsAt(paused)).toBeNull();
    expect(remainingMs(paused, T0 + 40 * MIN)).toBe(15 * MIN);

    const resumed = resume(paused, T0 + 40 * MIN);
    expect(isPaused(resumed)).toBe(false);
    expect(remainingMs(resumed, T0 + 45 * MIN)).toBe(10 * MIN);
    expect(endsAt(resumed)).toBe(T0 + 55 * MIN);
  });

  test('pausing twice or resuming a running timer changes nothing', () => {
    const paused = pause(begin(), T0 + MIN);
    expect(pause(paused, T0 + 2 * MIN)).toBe(paused);
    const run = begin();
    expect(resume(run, T0 + MIN)).toBe(run);
  });

  test('paused time is not focused time and not an interruption', () => {
    const resumed = resume(pause(begin(), T0 + 10 * MIN), T0 + 30 * MIN);
    const { session, completed } = finish(resumed, T0 + 45 * MIN);
    expect(completed).toBe(true);
    expect(session.focusedMinutes).toBe(25);
    expect(session.interruptions).toBe(0);
    expect(session.endedAt).toBe(new Date(T0 + 45 * MIN).toISOString());
  });
});

describe('leaving the app mid-session', () => {
  test('is one interruption, and the time away is not focused time', () => {
    const away = leave(begin(), T0 + 5 * MIN);
    const back = comeBack(away, T0 + 8 * MIN);
    expect(back.interruptions).toBe(1);
    expect(back.awayMs).toBe(3 * MIN);
    expect(back.returnedAt).toBe(T0 + 8 * MIN);
    // The timer itself kept going.
    expect(remainingMs(back, T0 + 8 * MIN)).toBe(17 * MIN);

    const { session } = finish(back, T0 + 25 * MIN);
    expect(session.focusedMinutes).toBe(22);
    expect(session.interruptions).toBe(1);
  });

  test('each absence counts once', () => {
    let run = begin();
    run = comeBack(leave(run, T0 + 2 * MIN), T0 + 3 * MIN);
    run = comeBack(leave(run, T0 + 10 * MIN), T0 + 12 * MIN);
    expect(run.interruptions).toBe(2);
    expect(run.awayMs).toBe(3 * MIN);
    // Coming back twice, or leaving twice, does not double count.
    expect(comeBack(run, T0 + 13 * MIN)).toBe(run);
    const away = leave(run, T0 + 14 * MIN);
    expect(leave(away, T0 + 15 * MIN)).toBe(away);
  });

  test('a glance shorter than the grace is not an interruption', () => {
    const back = comeBack(leave(begin(), T0 + MIN), T0 + MIN + FOCUS.AWAY_GRACE_MS - 1);
    expect(back.interruptions).toBe(0);
    expect(back.awayMs).toBe(0);
    expect(back.awaySince).toBeNull();

    const counted = comeBack(leave(begin(), T0 + MIN), T0 + MIN + FOCUS.AWAY_GRACE_MS);
    expect(counted.interruptions).toBe(1);
  });

  test('leaving while paused is not an interruption', () => {
    const paused = pause(begin(), T0 + MIN);
    expect(leave(paused, T0 + 2 * MIN)).toBe(paused);
  });

  test('away past the end: only time until the timer reached zero counts as away', () => {
    const away = leave(begin(), T0 + 20 * MIN);
    // Back two hours later.
    const { session, completed } = finish(away, T0 + 140 * MIN);
    expect(completed).toBe(true);
    expect(session.focusedMinutes).toBe(20);
    expect(session.interruptions).toBe(1);
    expect(session.endedAt).toBe(new Date(T0 + 25 * MIN).toISOString());
  });

  test('pausing right after coming back settles the absence first', () => {
    const paused = pause(leave(begin(), T0 + 5 * MIN), T0 + 9 * MIN);
    expect(paused.interruptions).toBe(1);
    expect(paused.awayMs).toBe(4 * MIN);
    expect(paused.bankedMs).toBe(9 * MIN);
  });
});

describe('finishing', () => {
  test('a full session records its planned length, its link and its parking lot', () => {
    const run = park(park(begin(50), ' renew the domain '), '   ');
    const { session, completed } = finish(run, T0 + 50 * MIN);
    expect(completed).toBe(true);
    expect(session).toEqual({
      id: 'run-1',
      startedAt: new Date(T0).toISOString(),
      endedAt: new Date(T0 + 50 * MIN).toISOString(),
      plannedMinutes: 50,
      focusedMinutes: 50,
      topicId: 'topic-1',
      trackId: 'track-js',
      interruptions: 0,
      parkingLot: ['renew the domain'],
    });
  });

  test('stopping early records the minutes actually focused, rounded down, ending now', () => {
    const result = finish(begin(), T0 + 12 * MIN + 59_000);
    expect(result.completed).toBe(false);
    expect(result.session.focusedMinutes).toBe(12);
    expect(result.session.plannedMinutes).toBe(25);
    expect(result.session.endedAt).toBe(new Date(T0 + 12 * MIN + 59_000).toISOString());
    expect(isKept(result)).toBe(true);
  });

  test('an early stop under a minute is not kept; a completed session always is', () => {
    expect(isKept(finish(begin(), T0 + 59_000))).toBe(false);
    expect(isKept(finish(begin(), T0 + MIN))).toBe(true);
    // Completed, but away for nearly all of it.
    const mostlyAway = leave(begin(5), T0 + 1000);
    const result = finish(mostlyAway, T0 + 30 * MIN);
    expect(result.session.focusedMinutes).toBe(0);
    expect(isKept(result)).toBe(true);
  });
});

describe('breaks', () => {
  test('short after a short session, long after a long one', () => {
    expect(suggestBreak(25, 1)).toBe(FOCUS.SHORT_BREAK_MINUTES);
    expect(suggestBreak(50, 1)).toBe(FOCUS.LONG_BREAK_MINUTES);
    expect(suggestBreak(90, 2)).toBe(FOCUS.LONG_BREAK_MINUTES);
  });

  test('every fourth session finished today earns the long break', () => {
    expect([1, 2, 3, 4, 5, 8].map((n) => suggestBreak(25, n))).toEqual([5, 5, 5, 15, 5, 15]);
    expect(suggestBreak(25, 0)).toBe(FOCUS.SHORT_BREAK_MINUTES);
  });
});

describe('lengths and display', () => {
  test('a custom length is a whole number of minutes within the limits', () => {
    expect(isValidLength(FOCUS.CUSTOM_MIN_MINUTES)).toBe(true);
    expect(isValidLength(FOCUS.CUSTOM_MAX_MINUTES)).toBe(true);
    expect(isValidLength(FOCUS.CUSTOM_MIN_MINUTES - 1)).toBe(false);
    expect(isValidLength(FOCUS.CUSTOM_MAX_MINUTES + 1)).toBe(false);
    expect(isValidLength(12.5)).toBe(false);
    expect(isValidLength(Number.NaN)).toBe(false);
  });

  test('the clock rounds up and reaches zero only at the end', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(25 * MIN - 1)).toBe('25:00');
    expect(formatClock(24 * MIN + 59_000)).toBe('24:59');
    expect(formatClock(90 * MIN)).toBe('90:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-500)).toBe('00:00');
  });

  test('spoken time is in whole minutes', () => {
    expect(spokenRemaining(18 * MIN + 30_000)).toBe('18 minutes left');
    expect(spokenRemaining(MIN)).toBe('1 minute left');
    expect(spokenRemaining(59_000)).toBe('under a minute left');
  });
});

describe('a running session survives the app being closed', () => {
  const stored = (run: ReturnType<typeof begin>, seenAt: number) => parseStoredRun(JSON.stringify({ run, seenAt }));

  test('round-trips through storage', () => {
    const run = park(begin(), 'call the bank');
    expect(stored(run, T0 + MIN)).toEqual({ run, seenAt: T0 + MIN });
  });

  test('rejects anything that is not a stored run', () => {
    expect(parseStoredRun(null)).toBeNull();
    expect(parseStoredRun('')).toBeNull();
    expect(parseStoredRun('not json')).toBeNull();
    expect(parseStoredRun('{"run":{"id":"x"},"seenAt":1}')).toBeNull();
    expect(parseStoredRun(JSON.stringify({ run: { ...begin(), plannedMs: 0 }, seenAt: T0 }))).toBeNull();
    expect(parseStoredRun(JSON.stringify({ run: { ...begin(), parkingLot: [1] }, seenAt: T0 }))).toBeNull();
  });

  test('killed without warning: away from when it was last seen', () => {
    const saved = stored(begin(), T0 + 6 * MIN);
    expect(saved).not.toBeNull();
    if (!saved) return;
    const run = restoreRun(saved, T0 + 10 * MIN);
    expect(run.interruptions).toBe(1);
    expect(run.awayMs).toBe(4 * MIN);
    expect(remainingMs(run, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  test('closed after going to the background: away from the moment it left', () => {
    const saved = stored(leave(begin(), T0 + 3 * MIN), T0 + 3 * MIN);
    if (!saved) throw new Error('expected a stored run');
    const run = restoreRun(saved, T0 + 60 * MIN);
    expect(run.interruptions).toBe(1);
    const { session, completed } = finish(run, T0 + 60 * MIN);
    expect(completed).toBe(true);
    expect(session.focusedMinutes).toBe(3);
    expect(session.endedAt).toBe(new Date(T0 + 25 * MIN).toISOString());
  });

  test('a paused session comes back paused, with nothing counted', () => {
    const saved = stored(pause(begin(), T0 + 5 * MIN), T0 + 5 * MIN);
    if (!saved) throw new Error('expected a stored run');
    const run = restoreRun(saved, T0 + 24 * 60 * MIN);
    expect(isPaused(run)).toBe(true);
    expect(run.interruptions).toBe(0);
    expect(remainingMs(run, T0 + 24 * 60 * MIN)).toBe(20 * MIN);
  });

  test('a quick reload is not an interruption', () => {
    const saved = stored(begin(), T0 + MIN);
    if (!saved) throw new Error('expected a stored run');
    expect(restoreRun(saved, T0 + MIN + 2000).interruptions).toBe(0);
  });
});
