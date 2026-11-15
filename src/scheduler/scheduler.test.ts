// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';

import { SCHEDULE } from './config';
import { localDate, toLocalDate } from './dates';
import {
  completeReview,
  createReviews,
  groupForToday,
  isOverdue,
  rescheduleForStudiedOn,
  snoozeReview,
} from './scheduler';
import type { Review, ScheduleOptions, TopicSchedule } from './types';

const d = localDate;
const IST = 'Asia/Kolkata';
/** An instant from a Chennai wall-clock time. */
const ist = (date: string, time = '19:30:00') => new Date(`${date}T${time}+05:30`);

let counter = 0;
const newId = () => `r${++counter}`;
const options: ScheduleOptions = { newId, timeZone: IST };

const topic = (overrides: Partial<TopicSchedule> = {}): TopicSchedule => ({
  id: 't1',
  studiedOn: d('2026-11-15'),
  status: 'active',
  ...overrides,
});

const byMark = (reviews: readonly Review[], mark: Review['dayMark']) => {
  const found = reviews.find((r) => r.dayMark === mark);
  if (!found) throw new Error(`no review with day mark ${mark}`);
  return found;
};

/** Due dates of every review except the ones named, for "nothing else moved" checks. */
const otherDueDates = (reviews: readonly Review[], ...exceptIds: string[]) =>
  Object.fromEntries(reviews.filter((r) => !exceptIds.includes(r.id)).map((r) => [r.id, r.dueOn]));

beforeEach(() => {
  counter = 0;
});

describe('config', () => {
  test('the offsets live in one object and default to day 4 and day 7', () => {
    expect(SCHEDULE.REVIEW_OFFSETS).toEqual([3, 6]);
    expect(SCHEDULE.GRADUATION_OFFSETS).toEqual([13, 29]);
  });
});

describe('creating reviews', () => {
  test('studying on D creates reviews at D+3 and D+6', () => {
    const reviews = createReviews(topic(), newId);
    expect(reviews).toHaveLength(2);
    expect(reviews.map((r) => [r.dayMark, r.dueOn])).toEqual([
      [4, '2026-11-18'],
      [7, '2026-11-21'],
    ]);
    for (const r of reviews) {
      expect(r).toMatchObject({ topicId: 't1', snoozedCount: 0, dueHistory: [] });
      expect(r.doneAt).toBeUndefined();
      expect(r.recall).toBeUndefined();
    }
    expect(new Set(reviews.map((r) => r.id)).size).toBe(2);
  });

  test('works across a month and year end', () => {
    const reviews = createReviews(topic({ studiedOn: d('2026-12-28') }), newId);
    expect(reviews.map((r) => r.dueOn)).toEqual(['2026-12-31', '2027-01-03']);
  });

  test('studying late at night in Chennai counts as that local day, not the UTC day', () => {
    // 00:30 IST on the 16th is 19:00 UTC on the 15th.
    const studiedOn = toLocalDate(ist('2026-11-16', '00:30:00'), IST);
    expect(studiedOn).toBe('2026-11-16');
    expect(createReviews(topic({ studiedOn }), newId).map((r) => r.dueOn)).toEqual(['2026-11-19', '2026-11-22']);
  });
});

describe('completing a review', () => {
  test('records recall and time, and leaves every other due date alone', () => {
    const reviews = createReviews(topic(), newId);
    const day4 = byMark(reviews, 4);
    const before = otherDueDates(reviews, day4.id);

    const result = completeReview(topic(), reviews, day4.id, 'solid', ist('2026-11-18'), options);

    const done = byMark(result.reviews, 4);
    expect(done.recall).toBe('solid');
    expect(done.doneAt).toBe(ist('2026-11-18').toISOString());
    expect(done.dueOn).toBe('2026-11-18');
    expect(otherDueDates(result.reviews, day4.id)).toEqual(before);
    expect(result.added).toEqual([]);
    expect(result.status).toBe('active');
  });

  test('fuzzy on day 4 continues normally to day 7', () => {
    const reviews = createReviews(topic(), newId);
    const result = completeReview(topic(), reviews, byMark(reviews, 4).id, 'fuzzy', ist('2026-11-18'), options);

    expect(result.reviews).toHaveLength(2);
    expect(result.status).toBe('active');
    expect(byMark(result.reviews, 7)).toMatchObject({ dueOn: '2026-11-21', snoozedCount: 0 });
    expect(byMark(result.reviews, 7).doneAt).toBeUndefined();
  });

  test('completing late does not move the next review', () => {
    const reviews = createReviews(topic(), newId);
    const result = completeReview(topic(), reviews, byMark(reviews, 4).id, 'solid', ist('2026-11-20'), options);
    expect(byMark(result.reviews, 7).dueOn).toBe('2026-11-21');
  });

  test('forgot adds exactly one extra review the next day and marks the topic leaky', () => {
    const reviews = createReviews(topic(), newId);
    const day4 = byMark(reviews, 4);
    const before = otherDueDates(reviews, day4.id);

    const result = completeReview(topic(), reviews, day4.id, 'forgot', ist('2026-11-18'), options);

    expect(result.status).toBe('leaky');
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({ dayMark: 'extra', dueOn: '2026-11-19', topicId: 't1', snoozedCount: 0 });
    expect(result.reviews).toHaveLength(3);
    // The topic rejoins the schedule: day 7 is exactly where it was.
    expect(otherDueDates(result.reviews, day4.id, result.added[0]!.id)).toEqual(before);
  });

  test('forgot on a review done late puts the extra on the day after it was reviewed', () => {
    const reviews = createReviews(topic(), newId);
    const result = completeReview(topic(), reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-25'), options);
    expect(result.added[0]?.dueOn).toBe('2026-11-26');
    expect(byMark(result.reviews, 7).dueOn).toBe('2026-11-21');
  });

  test('forgot just after local midnight uses the new local day', () => {
    const reviews = createReviews(topic(), newId);
    const day4 = byMark(reviews, 4);
    // 00:10 IST on the 19th is still the 18th in UTC.
    const afterMidnight = completeReview(topic(), reviews, day4.id, 'forgot', ist('2026-11-19', '00:10:00'), options);
    expect(afterMidnight.added[0]?.dueOn).toBe('2026-11-20');
    const beforeMidnight = completeReview(topic(), reviews, day4.id, 'forgot', ist('2026-11-18', '23:50:00'), options);
    expect(beforeMidnight.added[0]?.dueOn).toBe('2026-11-19');
  });

  test('forgot on the extra review adds another one the next day', () => {
    const reviews = createReviews(topic(), newId);
    const first = completeReview(topic(), reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-18'), options);
    const leaky = topic({ status: first.status });
    const second = completeReview(leaky, first.reviews, first.added[0]!.id, 'forgot', ist('2026-11-19'), options);

    expect(second.added).toHaveLength(1);
    expect(second.added[0]).toMatchObject({ dayMark: 'extra', dueOn: '2026-11-20' });
    expect(second.status).toBe('leaky');
  });

  test('a leaky topic stays leaky after a fuzzy or solid review that does not lock it', () => {
    const reviews = createReviews(topic(), newId);
    const first = completeReview(topic(), reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-18'), options);
    const leaky = topic({ status: 'leaky' });
    const second = completeReview(leaky, first.reviews, first.added[0]!.id, 'solid', ist('2026-11-19'), options);
    expect(second.status).toBe('leaky');
    expect(second.justLockedIn).toBe(false);
  });

  test('completing a review that is already done changes nothing', () => {
    const reviews = createReviews(topic(), newId);
    const day4 = byMark(reviews, 4);
    const once = completeReview(topic(), reviews, day4.id, 'solid', ist('2026-11-18'), options);
    const twice = completeReview(topic(), once.reviews, day4.id, 'forgot', ist('2026-11-19'), options);
    expect(twice.reviews).toEqual(once.reviews);
    expect(twice.added).toEqual([]);
    expect(twice.status).toBe('active');
  });

  test('an unknown review id or an archived topic changes nothing', () => {
    const reviews = createReviews(topic(), newId);
    expect(completeReview(topic(), reviews, 'nope', 'solid', ist('2026-11-18'), options).reviews).toEqual(reviews);
    const archived = topic({ status: 'archived' });
    const result = completeReview(archived, reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-18'), options);
    expect(result).toMatchObject({ reviews, status: 'archived', added: [] });
  });

  test('does not mutate its inputs', () => {
    const reviews = createReviews(topic(), newId);
    const snapshot = structuredClone(reviews);
    completeReview(topic(), reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-18'), options);
    expect(reviews).toEqual(snapshot);
  });
});

describe('locking in', () => {
  const throughDay4 = (recall: 'fuzzy' | 'solid' = 'solid') => {
    const reviews = createReviews(topic(), newId);
    return completeReview(topic(), reviews, byMark(reviews, 4).id, recall, ist('2026-11-18'), options).reviews;
  };

  test('solid on day 7 locks the topic in', () => {
    const reviews = throughDay4();
    const result = completeReview(topic(), reviews, byMark(reviews, 7).id, 'solid', ist('2026-11-21'), options);
    expect(result.status).toBe('locked');
    expect(result.justLockedIn).toBe(true);
    expect(result.added).toEqual([]);
  });

  test('solid on day 7 after a fuzzy day 4 still locks in', () => {
    const reviews = throughDay4('fuzzy');
    const result = completeReview(topic(), reviews, byMark(reviews, 7).id, 'solid', ist('2026-11-21'), options);
    expect(result.status).toBe('locked');
  });

  test('fuzzy on day 7 does not lock in and adds nothing', () => {
    const reviews = throughDay4();
    const result = completeReview(topic(), reviews, byMark(reviews, 7).id, 'fuzzy', ist('2026-11-21'), options);
    expect(result.status).toBe('active');
    expect(result.justLockedIn).toBe(false);
    expect(result.added).toEqual([]);
  });

  test('solid on day 4 alone does not lock in', () => {
    const reviews = createReviews(topic(), newId);
    const result = completeReview(topic(), reviews, byMark(reviews, 4).id, 'solid', ist('2026-11-18'), options);
    expect(result.status).toBe('active');
  });

  test('forgot on day 7, then solid on the extra review, locks in', () => {
    const reviews = throughDay4();
    const forgot = completeReview(topic(), reviews, byMark(reviews, 7).id, 'forgot', ist('2026-11-21'), options);
    expect(forgot.status).toBe('leaky');
    expect(forgot.added[0]?.dueOn).toBe('2026-11-22');

    const leaky = topic({ status: 'leaky' });
    const solid = completeReview(leaky, forgot.reviews, forgot.added[0]!.id, 'solid', ist('2026-11-22'), options);
    expect(solid.status).toBe('locked');
    expect(solid.justLockedIn).toBe(true);
  });

  test('solid on day 7 while an extra review is still waiting does not lock in yet', () => {
    const reviews = createReviews(topic(), newId);
    const forgot = completeReview(topic(), reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-20'), options);
    const leaky = topic({ status: 'leaky' });
    const day7 = completeReview(
      leaky,
      forgot.reviews,
      byMark(forgot.reviews, 7).id,
      'solid',
      ist('2026-11-21'),
      options,
    );
    expect(day7.status).toBe('leaky');

    const extra = completeReview(leaky, day7.reviews, forgot.added[0]!.id, 'solid', ist('2026-11-21'), options);
    expect(extra.status).toBe('locked');
  });

  test('graduation reviews are off by default', () => {
    const reviews = throughDay4();
    const result = completeReview(topic(), reviews, byMark(reviews, 7).id, 'solid', ist('2026-11-21'), options);
    expect(result.reviews).toHaveLength(2);
  });

  test('with graduation reviews on, locking in adds day 14 and day 30', () => {
    const reviews = throughDay4();
    const result = completeReview(topic(), reviews, byMark(reviews, 7).id, 'solid', ist('2026-11-21'), {
      ...options,
      graduationReviews: true,
    });
    expect(result.added.map((r) => [r.dayMark, r.dueOn])).toEqual([
      [14, '2026-11-28'],
      [30, '2026-12-14'],
    ]);
    expect(result.status).toBe('locked');
  });

  test('a topic locked in late never gets a graduation review dated in the past', () => {
    const reviews = throughDay4();
    const result = completeReview(topic(), reviews, byMark(reviews, 7).id, 'solid', ist('2026-12-05'), {
      ...options,
      graduationReviews: true,
    });
    expect(result.added.map((r) => [r.dayMark, r.dueOn])).toEqual([
      [14, '2026-12-06'],
      [30, '2026-12-14'],
    ]);
  });

  test('a locked topic stays locked through a fuzzy graduation review, and goes leaky on forgot', () => {
    const reviews = throughDay4();
    const withGraduation = { ...options, graduationReviews: true };
    const locked = completeReview(topic(), reviews, byMark(reviews, 7).id, 'solid', ist('2026-11-21'), withGraduation);
    const lockedTopic = topic({ status: 'locked' });
    const day14 = byMark(locked.reviews, 14);

    const fuzzy = completeReview(lockedTopic, locked.reviews, day14.id, 'fuzzy', ist('2026-11-28'), withGraduation);
    expect(fuzzy.status).toBe('locked');
    expect(fuzzy.added).toEqual([]);

    const forgot = completeReview(lockedTopic, locked.reviews, day14.id, 'forgot', ist('2026-11-28'), withGraduation);
    expect(forgot.status).toBe('leaky');
    expect(forgot.added[0]).toMatchObject({ dayMark: 'extra', dueOn: '2026-11-29' });
    expect(byMark(forgot.reviews, 30).dueOn).toBe('2026-12-14');

    // Solid on that extra locks it in again without duplicating graduation reviews.
    const relocked = completeReview(
      topic({ status: 'leaky' }),
      forgot.reviews,
      forgot.added[0]!.id,
      'solid',
      ist('2026-11-29'),
      withGraduation,
    );
    expect(relocked.status).toBe('locked');
    expect(relocked.added).toEqual([]);
  });
});

describe('snoozing', () => {
  test('moves one review by one day and keeps the original due date in history', () => {
    const reviews = createReviews(topic(), newId);
    const day4 = byMark(reviews, 4);
    const snoozed = snoozeReview(day4, ist('2026-11-18'), IST);

    expect(snoozed.dueOn).toBe('2026-11-19');
    expect(snoozed.dueHistory).toEqual(['2026-11-18']);
    expect(snoozed.snoozedCount).toBe(1);
    expect(snoozed.id).toBe(day4.id);
    // Only that one review is touched.
    expect(byMark(reviews, 7).dueOn).toBe('2026-11-21');
    expect(day4.dueOn).toBe('2026-11-18');
  });

  test('snoozing twice keeps both earlier dates, oldest first', () => {
    const day4 = byMark(createReviews(topic(), newId), 4);
    const once = snoozeReview(day4, ist('2026-11-18'), IST);
    const twice = snoozeReview(once, ist('2026-11-19'), IST);
    expect(twice.dueOn).toBe('2026-11-20');
    expect(twice.dueHistory).toEqual(['2026-11-18', '2026-11-19']);
    expect(twice.snoozedCount).toBe(2);
  });

  test('snoozing an overdue review moves it to tomorrow', () => {
    const day4 = byMark(createReviews(topic(), newId), 4);
    const snoozed = snoozeReview(day4, ist('2026-11-25'), IST);
    expect(snoozed.dueOn).toBe('2026-11-26');
    expect(snoozed.dueHistory).toEqual(['2026-11-18']);
  });

  test('snoozing a review that is not due yet moves it one day from its own date', () => {
    const day7 = byMark(createReviews(topic(), newId), 7);
    expect(snoozeReview(day7, ist('2026-11-16'), IST).dueOn).toBe('2026-11-22');
  });

  test('a done review cannot be snoozed', () => {
    const reviews = createReviews(topic(), newId);
    const result = completeReview(topic(), reviews, byMark(reviews, 4).id, 'solid', ist('2026-11-18'), options);
    const done = byMark(result.reviews, 4);
    expect(snoozeReview(done, ist('2026-11-18'), IST)).toBe(done);
  });
});

describe('missed reviews', () => {
  test('stay due: they are never skipped or deleted, however late', () => {
    const reviews = createReviews(topic(), newId);
    const muchLater = d('2027-03-01');
    const groups = groupForToday(reviews, muchLater);
    expect(groups.overdue.map((r) => r.dayMark)).toEqual([4, 7]);
    expect(reviews.every((r) => isOverdue(r, muchLater))).toBe(true);
  });

  test('can be completed whenever they are opened', () => {
    const reviews = createReviews(topic(), newId);
    const result = completeReview(topic(), reviews, byMark(reviews, 4).id, 'fuzzy', ist('2027-03-01'), options);
    expect(byMark(result.reviews, 4).recall).toBe('fuzzy');
    expect(byMark(result.reviews, 4).dueOn).toBe('2026-11-18');
  });
});

describe('editing studiedOn', () => {
  test('recomputes only the undone reviews', () => {
    const reviews = createReviews(topic(), newId);
    const afterDay4 = completeReview(topic(), reviews, byMark(reviews, 4).id, 'solid', ist('2026-11-18'), options);

    const moved = rescheduleForStudiedOn(afterDay4.reviews, d('2026-11-17'));

    expect(byMark(moved, 4)).toEqual(byMark(afterDay4.reviews, 4));
    expect(byMark(moved, 7).dueOn).toBe('2026-11-23');
  });

  test('moves both reviews when neither is done', () => {
    const moved = rescheduleForStudiedOn(createReviews(topic(), newId), d('2026-11-10'));
    expect(moved.map((r) => r.dueOn)).toEqual(['2026-11-13', '2026-11-16']);
  });

  test('leaves extra reviews where they are', () => {
    const reviews = createReviews(topic(), newId);
    const forgot = completeReview(topic(), reviews, byMark(reviews, 4).id, 'forgot', ist('2026-11-18'), options);
    const moved = rescheduleForStudiedOn(forgot.reviews, d('2026-11-20'));
    expect(byMark(moved, 'extra').dueOn).toBe('2026-11-19');
    expect(byMark(moved, 7).dueOn).toBe('2026-11-26');
  });

  test('moves undone graduation reviews too, and keeps snooze history', () => {
    const base = createReviews(topic(), newId);
    const snoozed = base.map((r) => (r.dayMark === 7 ? snoozeReview(r, ist('2026-11-21'), IST) : r));
    const withGraduation: Review[] = [
      ...snoozed,
      { id: 'g14', topicId: 't1', dayMark: 14, dueOn: d('2026-11-28'), snoozedCount: 0, dueHistory: [] },
    ];
    const moved = rescheduleForStudiedOn(withGraduation, d('2026-11-16'));
    expect(byMark(moved, 14).dueOn).toBe('2026-11-29');
    expect(byMark(moved, 7)).toMatchObject({ dueOn: '2026-11-22', snoozedCount: 1, dueHistory: ['2026-11-21'] });
  });

  test('does not mutate its input', () => {
    const reviews = createReviews(topic(), newId);
    const snapshot = structuredClone(reviews);
    rescheduleForStudiedOn(reviews, d('2026-12-01'));
    expect(reviews).toEqual(snapshot);
  });
});

describe('today groups', () => {
  const review = (id: string, dueOn: string, done = false): Review => ({
    id,
    topicId: 't',
    dayMark: 4,
    dueOn: d(dueOn),
    snoozedCount: 0,
    dueHistory: [],
    ...(done ? { doneAt: '2026-11-15T10:00:00.000Z', recall: 'solid' as const } : {}),
  });
  const ids = (list: Review[]) => list.map((r) => r.id);

  test('splits into due today, overdue and coming up in the next 7 days', () => {
    const groups = groupForToday(
      [
        review('old', '2026-11-10'),
        review('yesterday', '2026-11-14'),
        review('today', '2026-11-15'),
        review('tomorrow', '2026-11-16'),
        review('in7', '2026-11-22'),
        review('in8', '2026-11-23'),
        review('done-today', '2026-11-15', true),
        review('done-old', '2026-11-01', true),
      ],
      d('2026-11-15'),
    );
    expect(ids(groups.dueToday)).toEqual(['today']);
    expect(ids(groups.overdue)).toEqual(['old', 'yesterday']);
    expect(ids(groups.comingUp)).toEqual(['tomorrow', 'in7']);
  });

  test('sorts overdue oldest first and coming up soonest first', () => {
    const groups = groupForToday(
      [review('b', '2026-11-13'), review('a', '2026-11-02'), review('y', '2026-11-20'), review('x', '2026-11-17')],
      d('2026-11-15'),
    );
    expect(ids(groups.overdue)).toEqual(['a', 'b']);
    expect(ids(groups.comingUp)).toEqual(['x', 'y']);
  });

  test('a review becomes due at local midnight, not UTC midnight', () => {
    const reviews = [review('r', '2026-11-18')];
    const lastMinute = toLocalDate(ist('2026-11-17', '23:59:00'), IST);
    const firstMinute = toLocalDate(ist('2026-11-18', '00:01:00'), IST);
    // At 00:01 IST it is still the 17th in UTC, and the review must already be due.
    expect(ist('2026-11-18', '00:01:00').toISOString().slice(0, 10)).toBe('2026-11-17');
    expect(ids(groupForToday(reviews, lastMinute).comingUp)).toEqual(['r']);
    expect(ids(groupForToday(reviews, firstMinute).dueToday)).toEqual(['r']);
  });

  test('after travelling to another timezone, the same stored date is judged by the new local day', () => {
    const reviews = [review('r', '2026-11-18')];
    const instant = new Date('2026-11-18T01:00:00Z');
    // In Chennai it is already the 18th; in Los Angeles it is still the 17th.
    expect(ids(groupForToday(reviews, toLocalDate(instant, 'Asia/Kolkata')).dueToday)).toEqual(['r']);
    expect(ids(groupForToday(reviews, toLocalDate(instant, 'America/Los_Angeles')).comingUp)).toEqual(['r']);
    // The stored due date itself never changes.
    expect(reviews[0]?.dueOn).toBe('2026-11-18');
  });

  test('reviews scheduled across a daylight-saving change land on the right calendar days', () => {
    const NY = 'America/New_York';
    // Studied the evening before clocks spring forward (2026-03-08).
    const studiedOn = toLocalDate(new Date('2026-03-07T21:00:00-05:00'), NY);
    const reviews = createReviews({ id: 't1', studiedOn }, newId);
    expect(reviews.map((r) => r.dueOn)).toEqual(['2026-03-10', '2026-03-13']);

    // Forgot late on the short day: the extra is still simply the next calendar day.
    const dst = topic({ studiedOn: d('2026-03-02') });
    const dstReviews = createReviews(dst, newId);
    const result = completeReview(
      dst,
      dstReviews,
      byMark(dstReviews, 7).id,
      'forgot',
      new Date('2026-03-08T23:30:00-04:00'),
      { newId, timeZone: NY },
    );
    expect(result.added[0]?.dueOn).toBe('2026-03-09');

    // And across the autumn change (2026-11-01), when the day is 25 hours long.
    const autumn = createReviews({ id: 't2', studiedOn: d('2026-10-29') }, newId);
    expect(autumn.map((r) => r.dueOn)).toEqual(['2026-11-01', '2026-11-04']);
  });
});

describe('purity', () => {
  test('the scheduler module imports nothing from React, Ionic, Capacitor or the app', () => {
    const dir = resolve(process.cwd(), 'src/scheduler');
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const imports = [...readFileSync(resolve(dir, file), 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const specifier of imports) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/[\w-]+$/);
      }
    }
  });
});
