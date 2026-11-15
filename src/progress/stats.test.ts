// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { Review, Track } from '../data/types';
import { localDate, type LocalDate } from '../scheduler';

import { activityByDay, heatmap, lockedCount, reviewCompletion, streakFor, weeklyFocus, type HeatCell } from './stats';

const d = localDate;
// Week of Monday 9 to Sunday 15 November 2026.
const MON = d('2026-11-09');
const FRI = d('2026-11-13');
const SUN = d('2026-11-15');

/** An instant on a local calendar day, as the ISO text the database stores. */
const at = (date: string, hour = 10, minute = 0): string => {
  const [y, m, day] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1, hour, minute).toISOString();
};
const days = (...list: string[]): Set<LocalDate> => new Set(list.map(d));

describe('what counts as a study day', () => {
  test('studying, finishing a review and focusing each light their own day', () => {
    const activity = activityByDay(
      [{ studiedOn: d('2026-11-09') }, { studiedOn: d('2026-11-09') }],
      [{ doneAt: at('2026-11-09', 19) }, { doneAt: at('2026-11-10', 19) }, {}],
      [
        { startedAt: at('2026-11-10', 8), focusedMinutes: 25 },
        { startedAt: at('2026-11-11', 8), focusedMinutes: 0 },
      ],
    );
    expect(activity.get(d('2026-11-09'))).toBe(3);
    expect(activity.get(d('2026-11-10'))).toBe(2);
    // A session with no focused time lights nothing.
    expect(activity.has(d('2026-11-11'))).toBe(false);
  });

  test('a late-night session belongs to that evening', () => {
    const activity = activityByDay([], [], [{ startedAt: at('2026-11-09', 23, 50), focusedMinutes: 20 }]);
    expect([...activity.keys()]).toEqual(['2026-11-09']);
  });

  test('a time that cannot be read is ignored', () => {
    expect(activityByDay([], [{ doneAt: 'not a time' }], []).size).toBe(0);
  });
});

describe('the gentle streak', () => {
  test('is zero with nothing done, and the rest day is still held', () => {
    expect(streakFor(days(), FRI)).toEqual({ days: 0, todayDone: false, restAvailable: true });
  });

  test('counts days in a row up to today', () => {
    expect(streakFor(days('2026-11-11', '2026-11-12', '2026-11-13'), FRI)).toEqual({
      days: 3,
      todayDone: true,
      restAvailable: true,
    });
  });

  test('today is not held against it until it is over', () => {
    const streak = streakFor(days('2026-11-10', '2026-11-11', '2026-11-12'), FRI);
    expect(streak).toEqual({ days: 3, todayDone: false, restAvailable: true });
  });

  test('one missed day a week is forgiven, and is not counted as a study day', () => {
    // Wednesday missed.
    const streak = streakFor(days('2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'), FRI);
    expect(streak).toEqual({ days: 4, todayDone: true, restAvailable: false });
  });

  test('a second missed day in the same week ends it', () => {
    // Tuesday forgiven, Wednesday not.
    const streak = streakFor(days('2026-11-09', '2026-11-12', '2026-11-13'), FRI);
    expect(streak.days).toBe(2);
  });

  test('each new week brings a new rest day', () => {
    // Tue 10 and Tue 17 missed: both forgiven, in different weeks.
    const active = days(
      '2026-11-09',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-18',
    );
    const streak = streakFor(active, d('2026-11-18'));
    expect(streak).toEqual({ days: 8, todayDone: true, restAvailable: false });
  });

  test('a rest day taken on Sunday does not borrow from the next week', () => {
    // Sunday 15 missed (forgiven); Monday 16 and Tuesday 17 done; Wednesday 18 missed (a new week's rest).
    const active = days('2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17', '2026-11-19');
    expect(streakFor(active, d('2026-11-19')).days).toBe(6);
  });

  test('with this week’s rest already used, a missed yesterday ends it', () => {
    // Tue forgiven, Wed and Thu missed, today (Fri) not yet done.
    const streak = streakFor(days('2026-11-09'), FRI);
    expect(streak.days).toBe(0);
    expect(streak.restAvailable).toBe(false);
  });

  test('yesterday forgiven while today is still open', () => {
    const streak = streakFor(days('2026-11-09', '2026-11-10'), d('2026-11-12'));
    expect(streak).toEqual({ days: 2, todayDone: false, restAvailable: false });
  });

  test('days missed before a first start cost nothing', () => {
    const streak = streakFor(days('2026-11-12', '2026-11-13'), FRI);
    expect(streak).toEqual({ days: 2, todayDone: true, restAvailable: true });
  });

  test('a streak that ended does not spend rest days it could not use', () => {
    // Started Monday, broke on Wednesday, started again today.
    const streak = streakFor(days('2026-11-09', '2026-11-13'), FRI);
    expect(streak.days).toBe(1);
  });

  test('activity dated after today is ignored', () => {
    expect(streakFor(days('2026-11-14', '2026-11-15'), FRI)).toEqual({
      days: 0,
      todayDone: false,
      restAvailable: true,
    });
  });

  test('works across a year end', () => {
    const active = days('2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02');
    expect(streakFor(active, d('2027-01-02')).days).toBe(4);
  });
});

describe('the twelve-week heatmap', () => {
  const activity = new Map<LocalDate, number>([
    [d('2026-11-09'), 1],
    [d('2026-11-10'), 2],
    [d('2026-11-11'), 5],
    [d('2026-08-24'), 1],
    [d('2026-08-23'), 4], // the Sunday before the first week: outside
    [d('2026-11-14'), 3], // the future from Friday's point of view
  ]);
  const map = heatmap(activity, FRI);
  const cell = (date: string): HeatCell => map.cells.find((c) => c.date === d(date)) as HeatCell;

  test('is twelve whole weeks, Monday to Sunday, ending with this one', () => {
    expect(map.cells).toHaveLength(84);
    expect(map.weeks).toBe(12);
    expect(map.cells[0]?.date).toBe('2026-08-24');
    expect(map.cells[83]?.date).toBe('2026-11-15');
    expect(
      map.cells.filter((_, i) => i % 7 === 0).every((c) => new Date(`${c.date}T12:00:00Z`).getUTCDay() === 1),
    ).toBe(true);
  });

  test('shades by how much was done', () => {
    expect(cell('2026-11-09').level).toBe(1);
    expect(cell('2026-11-10').level).toBe(2);
    expect(cell('2026-11-11').level).toBe(3);
    expect(cell('2026-11-12').level).toBe(0);
  });

  test('marks days still to come and never shades them', () => {
    expect(cell('2026-11-13').future).toBe(false);
    expect(cell('2026-11-14')).toMatchObject({ future: true, count: 0, level: 0 });
    expect(map.cells.filter((c) => c.future)).toHaveLength(2);
  });

  test('counts study days inside the window only', () => {
    expect(map.studiedDays).toBe(4);
  });

  test('an empty history is all quiet', () => {
    const empty = heatmap(new Map(), SUN);
    expect(empty.studiedDays).toBe(0);
    expect(empty.cells.every((c) => c.level === 0 && !c.future)).toBe(true);
  });
});

describe('weekly focus against targets', () => {
  const track = (id: string, order: number, over: Partial<Track> = {}): Track => ({
    id,
    name: id,
    colour: 'moss',
    weeklyTargetMinutes: 120,
    defaultKind: 'concept',
    order,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });
  const tracks = [track('b', 1), track('a', 0, { weeklyTargetMinutes: 60 }), track('old', 2, { archived: true })];

  test('adds up this week per track, in track order, with every live track present', () => {
    const week = weeklyFocus(
      [
        { startedAt: at('2026-11-09', 8), focusedMinutes: 25, trackId: 'a' },
        { startedAt: at('2026-11-12', 8), focusedMinutes: 50, trackId: 'a' },
        { startedAt: at('2026-11-13', 8), focusedMinutes: 30, trackId: 'b' },
      ],
      tracks,
      FRI,
    );
    expect(week.weekStart).toBe(MON);
    expect(week.tracks.map((t) => [t.trackId, t.minutes, t.targetMinutes])).toEqual([
      ['a', 75, 60],
      ['b', 30, 120],
    ]);
    expect(week.totalMinutes).toBe(105);
    expect(week.totalTargetMinutes).toBe(180);
    expect(week.otherMinutes).toBe(0);
  });

  test('Sunday night belongs to the old week and Monday morning to the new one', () => {
    const sessions = [
      { startedAt: at('2026-11-08', 23, 30), focusedMinutes: 40, trackId: 'a' },
      { startedAt: at('2026-11-09', 0, 10), focusedMinutes: 15, trackId: 'a' },
    ];
    expect(weeklyFocus(sessions, tracks, MON).totalMinutes).toBe(15);
    expect(weeklyFocus(sessions, tracks, d('2026-11-08')).totalMinutes).toBe(40);
  });

  test('time on an archived track, or none, still counts toward the total', () => {
    const week = weeklyFocus(
      [
        { startedAt: at('2026-11-10'), focusedMinutes: 20, trackId: 'old' },
        { startedAt: at('2026-11-10'), focusedMinutes: 10 },
      ],
      tracks,
      FRI,
    );
    expect(week.totalMinutes).toBe(30);
    expect(week.otherMinutes).toBe(30);
    expect(week.tracks.every((t) => t.minutes === 0)).toBe(true);
    expect(week.totalTargetMinutes).toBe(180);
  });

  test('nothing yet is zero, not an error', () => {
    expect(weeklyFocus([], tracks, FRI).totalMinutes).toBe(0);
    expect(weeklyFocus([], [], FRI)).toMatchObject({ tracks: [], totalTargetMinutes: 0 });
  });
});

describe('review completion', () => {
  const topics = [
    { id: 't1', status: 'active' as const },
    { id: 'gone', status: 'archived' as const },
  ];
  const review = (over: Partial<Review>): Review => ({
    id: Math.random().toString(36),
    topicId: 't1',
    dayMark: 4,
    dueOn: d('2026-11-10'),
    snoozedCount: 0,
    dueHistory: [],
    ...over,
  });

  test('counts late reviews as done and open ones as not yet', () => {
    const c = reviewCompletion(
      [
        review({ dueOn: d('2026-11-01'), doneAt: at('2026-11-01') }),
        review({ dueOn: d('2026-11-05'), doneAt: at('2026-11-09') }),
        review({ dueOn: d('2026-11-08') }),
        review({ dueOn: d('2026-11-10') }),
      ],
      topics,
      FRI,
    );
    expect(c).toEqual({ due: 4, done: 2, rate: 0.5 });
  });

  test('a review due today is not missed until it is over, but counts once done', () => {
    expect(reviewCompletion([review({ dueOn: FRI })], topics, FRI)).toEqual({ due: 0, done: 0, rate: null });
    expect(reviewCompletion([review({ dueOn: FRI, doneAt: at('2026-11-13') })], topics, FRI)).toEqual({
      due: 1,
      done: 1,
      rate: 1,
    });
  });

  test('looks back four weeks and not at reviews still ahead', () => {
    const c = reviewCompletion(
      [
        review({ dueOn: d('2026-10-16') }), // 28 days ago: outside
        review({ dueOn: d('2026-10-17') }), // 27 days ago: inside
        review({ dueOn: d('2026-11-14'), doneAt: at('2026-11-13') }), // not due yet
      ],
      topics,
      FRI,
    );
    expect(c).toEqual({ due: 1, done: 0, rate: 0 });
  });

  test('ignores reviews of archived topics, and says nothing when nothing was due', () => {
    expect(reviewCompletion([review({ topicId: 'gone' })], topics, FRI).rate).toBeNull();
    expect(reviewCompletion([], topics, FRI)).toEqual({ due: 0, done: 0, rate: null });
  });
});

test('counts topics that are locked in', () => {
  expect(lockedCount([{ status: 'locked' }, { status: 'active' }, { status: 'locked' }, { status: 'leaky' }])).toBe(2);
  expect(lockedCount([])).toBe(0);
});
