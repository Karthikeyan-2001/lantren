// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { localDate, type Review } from '../scheduler';

import {
  REMINDERS,
  deliveryFor,
  inQuietHours,
  planReminders,
  type ReminderSettings,
  type ReminderTopic,
  type WallClock,
} from './plan';

const d = localDate;
const SETTINGS: ReminderSettings = {
  reminders: true,
  reminderTime: '19:30',
  dailyDigest: false,
  quietHours: { start: '22:00', end: '07:00' },
};

const topic = (id: string, over: Partial<ReminderTopic> = {}): ReminderTopic => ({
  id,
  title: `Topic ${id}`,
  status: 'active',
  kind: 'concept',
  ...over,
});

const review = (id: string, topicId: string, dueOn: string, over: Partial<Review> = {}): Review => ({
  id,
  topicId,
  dayMark: 4,
  dueOn: d(dueOn),
  snoozedCount: 0,
  dueHistory: [],
  ...over,
});

const at = (date: string, time: string): WallClock => ({ date: d(date), time });
const NOW = at('2026-11-15', '10:00');

const plan = (reviews: Review[], topics: ReminderTopic[], settings = SETTINGS, now = NOW) =>
  planReminders({ reviews, topics, settings, now });

describe('quiet hours', () => {
  test('a window that runs past midnight covers late evening and early morning', () => {
    const quiet = { start: '22:00', end: '07:00' };
    expect(inQuietHours('23:15', quiet)).toBe(true);
    expect(inQuietHours('06:59', quiet)).toBe(true);
    expect(inQuietHours('07:00', quiet)).toBe(false);
    expect(inQuietHours('21:59', quiet)).toBe(false);
    expect(inQuietHours('22:00', quiet)).toBe(true);
  });

  test('a same-day window, no window, and an empty window', () => {
    expect(inQuietHours('14:00', { start: '13:00', end: '15:00' })).toBe(true);
    expect(inQuietHours('15:00', { start: '13:00', end: '15:00' })).toBe(false);
    expect(inQuietHours('23:00', null)).toBe(false);
    expect(inQuietHours('09:00', { start: '09:00', end: '09:00' })).toBe(false);
  });

  test('a reminder time outside quiet hours is delivered as chosen', () => {
    expect(deliveryFor(SETTINGS)).toEqual({ time: '19:30', dayShift: 0, moved: false });
  });

  test('a late-evening reminder waits for the next morning', () => {
    expect(deliveryFor({ ...SETTINGS, reminderTime: '23:00' })).toEqual({ time: '07:00', dayShift: 1, moved: true });
  });

  test('an early-morning reminder waits until quiet hours end the same day', () => {
    expect(deliveryFor({ ...SETTINGS, reminderTime: '06:00' })).toEqual({ time: '07:00', dayShift: 0, moved: true });
  });

  test('a malformed reminder time falls back to the default', () => {
    expect(deliveryFor({ ...SETTINGS, reminderTime: '7pm' }).time).toBe(REMINDERS.DEFAULT_TIME);
  });
});

describe('one reminder per review', () => {
  test('each open review reminds on its due day at the chosen time', () => {
    const result = plan(
      [review('r4', 'a', '2026-11-18'), review('r7', 'a', '2026-11-21', { dayMark: 7 })],
      [topic('a', { title: 'Closures' })],
    );
    expect(result.map((r) => [r.kind, r.at, r.title, r.body, r.reviewId])).toEqual([
      ['review', at('2026-11-18', '19:30'), 'Closures', 'Day 4 review. About 4 minutes.', 'r4'],
      ['review', at('2026-11-21', '19:30'), 'Closures', 'Day 7 review. About 4 minutes.', 'r7'],
    ]);
  });

  test('nothing is planned when reminders are off', () => {
    expect(plan([review('r', 'a', '2026-11-18')], [topic('a')], { ...SETTINGS, reminders: false })).toEqual([]);
  });

  test('done reviews, archived topics and orphaned reviews are left out', () => {
    const result = plan(
      [
        review('done', 'a', '2026-11-18', { doneAt: '2026-11-14T10:00:00.000Z', recall: 'solid' }),
        review('archived', 'b', '2026-11-18'),
        review('orphan', 'gone', '2026-11-18'),
      ],
      [topic('a'), topic('b', { status: 'archived' })],
    );
    expect(result).toEqual([]);
  });

  test('a review due today reminds today while the time is still ahead', () => {
    const result = plan([review('r', 'a', '2026-11-15')], [topic('a')]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'review', at: at('2026-11-15', '19:30') });
  });

  test('exactly at the reminder time counts as passed', () => {
    const result = plan([review('r', 'a', '2026-11-15')], [topic('a')], SETTINGS, at('2026-11-15', '19:30'));
    expect(result.map((r) => r.kind)).toEqual(['waiting']);
  });

  test('an extra review and a problem are worded for what they are', () => {
    const result = plan(
      [review('x', 'a', '2026-11-16', { dayMark: 'extra' }), review('p', 'b', '2026-11-17')],
      [topic('a'), topic('b', { kind: 'dsa-problem' })],
    );
    expect(result.map((r) => r.body)).toEqual(['One more look. About 4 minutes.', 'Day 4 review. About 10 minutes.']);
  });

  test('reviews past the horizon wait for a later plan', () => {
    const result = plan([review('far', 'a', '2026-12-16'), review('edge', 'a', '2026-12-15')], [topic('a')]);
    expect(result.map((r) => r.reviewId)).toEqual(['edge']);
  });

  test('the plan is capped, keeping the soonest', () => {
    const reviews = Array.from({ length: 60 }, (_, i) =>
      review(`r${String(i).padStart(2, '0')}`, 'a', i < 30 ? '2026-11-20' : '2026-11-16'),
    );
    const result = plan(reviews, [topic('a')]);
    expect(result).toHaveLength(REMINDERS.MAX_PLANNED);
    expect(result.slice(0, 30).every((r) => r.at.date === '2026-11-16')).toBe(true);
  });

  test('ids are positive 31-bit integers, unique, and stable between plans', () => {
    const reviews = Array.from({ length: 40 }, (_, i) => review(`r${i}`, 'a', '2026-11-18'));
    const first = plan(reviews, [topic('a')]);
    const second = plan(reviews, [topic('a')]);
    expect(new Set(first.map((r) => r.id)).size).toBe(40);
    expect(first.every((r) => Number.isInteger(r.id) && r.id > 0 && r.id <= 0x7fffffff)).toBe(true);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });
});

describe('reviews already waiting', () => {
  test('share one nudge at the next reminder time, and are not reminded one by one', () => {
    const result = plan(
      [review('old1', 'a', '2026-11-12'), review('old2', 'b', '2026-11-14'), review('new', 'a', '2026-11-15')],
      [topic('a'), topic('b', { kind: 'dsa-problem' })],
    );
    expect(result.map((r) => [r.kind, r.at, r.title, r.body, r.reviewId])).toEqual([
      ['waiting', at('2026-11-15', '19:30'), '2 reviews waiting for you', 'About 14 minutes. No rush.', undefined],
      ['review', at('2026-11-15', '19:30'), 'Topic a', 'Day 4 review. About 4 minutes.', 'new'],
    ]);
  });

  test('a single waiting review is named and opens directly', () => {
    const result = plan([review('old', 'a', '2026-11-13')], [topic('a', { title: 'Closures' })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'waiting', title: '“Closures” is waiting for you', reviewId: 'old' });
  });

  test("after today's time has passed, today's reviews join tomorrow's nudge", () => {
    const result = plan(
      [review('today', 'a', '2026-11-15'), review('tomorrow', 'a', '2026-11-16')],
      [topic('a')],
      SETTINGS,
      at('2026-11-15', '21:00'),
    );
    expect(result.map((r) => [r.kind, r.at.date, r.reviewId])).toEqual([
      ['waiting', '2026-11-16', 'today'],
      ['review', '2026-11-16', 'tomorrow'],
    ]);
  });

  test('there is one nudge, not one every day', () => {
    const result = plan([review('old', 'a', '2026-11-01')], [topic('a')]);
    expect(result).toHaveLength(1);
  });
});

describe('quiet hours and the plan', () => {
  const late: ReminderSettings = { ...SETTINGS, reminderTime: '23:00' };

  test('a reminder inside quiet hours is delivered the next morning', () => {
    const result = plan([review('r', 'a', '2026-11-18')], [topic('a')], late);
    expect(result[0]?.at).toEqual(at('2026-11-19', '07:00'));
  });

  test("early in the morning, yesterday's review is still ahead of its moved reminder", () => {
    const result = plan([review('r', 'a', '2026-11-14')], [topic('a')], late, at('2026-11-15', '06:00'));
    expect(result.map((r) => [r.kind, r.at])).toEqual([['review', at('2026-11-15', '07:00')]]);
  });

  test('later that morning it is simply waiting', () => {
    const result = plan([review('r', 'a', '2026-11-14')], [topic('a')], late, at('2026-11-15', '08:00'));
    expect(result.map((r) => [r.kind, r.at])).toEqual([['waiting', at('2026-11-16', '07:00')]]);
  });

  test('nothing is ever planned inside quiet hours', () => {
    for (const reminderTime of ['00:10', '06:59', '19:30', '22:00', '23:59']) {
      const settings = { ...SETTINGS, reminderTime };
      const result = plan([review('r', 'a', '2026-11-13'), review('s', 'a', '2026-11-18')], [topic('a')], settings);
      expect(result.length).toBeGreaterThan(0);
      for (const r of result) expect(inQuietHours(r.at.time, settings.quietHours)).toBe(false);
    }
  });
});

describe('daily digest', () => {
  const digest: ReminderSettings = { ...SETTINGS, dailyDigest: true };

  test('replaces per-review reminders with one line a day, counting what is waiting by then', () => {
    const result = plan(
      [
        review('old', 'a', '2026-11-13'),
        review('today', 'a', '2026-11-15'),
        review('wed', 'b', '2026-11-18'),
        review('far', 'b', '2026-11-30'),
      ],
      [topic('a'), topic('b')],
      digest,
    );
    expect(result.every((r) => r.kind === 'digest' && r.reviewId === undefined)).toBe(true);
    expect(result.map((r) => [r.at.date, r.title, r.body])).toEqual([
      ['2026-11-15', '2 reviews waiting', 'About 8 minutes, whenever you are ready.'],
      ['2026-11-16', '2 reviews waiting', 'About 8 minutes, whenever you are ready.'],
      ['2026-11-17', '2 reviews waiting', 'About 8 minutes, whenever you are ready.'],
      ['2026-11-18', '3 reviews waiting', 'About 12 minutes, whenever you are ready.'],
      ['2026-11-19', '3 reviews waiting', 'About 12 minutes, whenever you are ready.'],
      ['2026-11-20', '3 reviews waiting', 'About 12 minutes, whenever you are ready.'],
      ['2026-11-21', '3 reviews waiting', 'About 12 minutes, whenever you are ready.'],
    ]);
  });

  test('days with nothing waiting stay silent', () => {
    const result = plan([review('wed', 'a', '2026-11-18')], [topic('a')], digest);
    expect(result[0]).toMatchObject({ at: at('2026-11-18', '19:30'), title: '1 review waiting' });
    expect(result).toHaveLength(4);
  });

  test('starts tomorrow once today’s time has passed', () => {
    const result = plan([review('r', 'a', '2026-11-15')], [topic('a')], digest, at('2026-11-15', '20:00'));
    expect(result[0]?.at).toEqual(at('2026-11-16', '19:30'));
  });
});

describe('month and year edges', () => {
  test('a moved reminder crosses into the new year on the calendar', () => {
    const result = plan(
      [review('r', 'a', '2026-12-31')],
      [topic('a')],
      { ...SETTINGS, reminderTime: '23:30' },
      at('2026-12-30', '09:00'),
    );
    expect(result[0]?.at).toEqual(at('2027-01-01', '07:00'));
  });
});
