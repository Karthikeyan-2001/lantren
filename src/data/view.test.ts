import { describe, expect, test } from 'vitest';

import { localDate } from '../scheduler';

import { newId } from './ids';
import type { Review, Topic } from './types';
import {
  countWord,
  dayMarkLabel,
  flameFor,
  lanternFlames,
  nextForTopic,
  nextWaiting,
  outcomeCopy,
  relativeDay,
  shortDate,
  whenWords,
} from './view';

const today = localDate('2026-11-15');

const topic = (status: Topic['status'] = 'active'): Topic => ({
  id: 't1',
  title: 'Closures',
  trackId: 'track-js',
  kind: 'concept',
  notes: '',
  confidence: 3,
  studiedOn: localDate('2026-11-12'),
  status,
  createdAt: '',
  updatedAt: '',
});

const review = (dayMark: Review['dayMark'], dueOn: string, doneAt?: string): Review => ({
  id: `r-${dayMark}`,
  topicId: 't1',
  dayMark,
  dueOn: localDate(dueOn),
  doneAt,
  snoozedCount: 0,
  dueHistory: [],
});

describe('flames', () => {
  test('a review ahead is unlit, due or waiting flickers, done is lit', () => {
    expect(flameFor(review(4, '2026-11-16'), topic(), today)).toBe('unlit');
    expect(flameFor(review(4, '2026-11-15'), topic(), today)).toBe('waiting');
    expect(flameFor(review(4, '2026-11-10'), topic(), today)).toBe('waiting');
    expect(flameFor(review(4, '2026-11-10', '2026-11-10T14:00:00Z'), topic(), today)).toBe('lit');
    expect(flameFor(undefined, topic(), today)).toBe('unlit');
  });

  test('a locked-in topic shows two steady flames', () => {
    expect(lanternFlames(topic('locked'), [], today)).toEqual(['steady', 'steady']);
  });

  test('the lantern reads day 4 and day 7 from the topic’s own reviews, ignoring extras', () => {
    const reviews = [
      review(4, '2026-11-15', '2026-11-15T09:00:00Z'),
      review(7, '2026-11-18'),
      review('extra', '2026-11-16'),
      { ...review(4, '2026-11-15'), id: 'other', topicId: 'someone-else' },
    ];
    expect(lanternFlames(topic(), reviews, today)).toEqual(['lit', 'unlit']);
  });
});

describe('words', () => {
  test('relative days', () => {
    expect(relativeDay(localDate('2026-11-15'), today)).toBe('today');
    expect(relativeDay(localDate('2026-11-16'), today)).toBe('tomorrow');
    expect(relativeDay(localDate('2026-11-14'), today)).toBe('since yesterday');
    expect(relativeDay(localDate('2026-11-12'), today)).toBe('since Thu 12 Nov');
    expect(relativeDay(localDate('2026-11-19'), today)).toBe('Thu 19 Nov');
  });

  test('short dates come from the calendar date, not UTC', () => {
    expect(shortDate(localDate('2026-01-01'))).toBe('Thu 1 Jan');
    expect(shortDate(localDate('2026-03-29'))).toBe('Sun 29 Mar');
  });

  test('day marks and counts', () => {
    expect(dayMarkLabel(review(4, '2026-11-15'))).toBe('day 4');
    expect(dayMarkLabel(review('extra', '2026-11-15'))).toBe('one more look');
    expect(countWord(1)).toBe('One');
    expect(countWord(12)).toBe('12');
  });
});

test('ids are distinct v4-shaped uuids', () => {
  const ids = new Set(Array.from({ length: 200 }, newId));
  expect(ids.size).toBe(200);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

describe('after a review', () => {
  test('when words', () => {
    expect(whenWords(localDate('2026-11-15'), today)).toBe('today');
    expect(whenWords(localDate('2026-11-16'), today)).toBe('tomorrow');
    expect(whenWords(localDate('2026-11-18'), today)).toBe('on Wed 18 Nov');
  });

  test('the next waiting review is the oldest undone one due by today, skipping archived topics', () => {
    const other: Topic = { ...topic('archived'), id: 't2' };
    const reviews = [
      review(4, '2026-11-15'),
      { ...review(7, '2026-11-13'), id: 'old' },
      { ...review(4, '2026-11-10'), id: 'archived', topicId: 't2' },
      { ...review(4, '2026-11-11'), id: 'done', doneAt: '2026-11-11T10:00:00Z' },
      { ...review(7, '2026-11-16'), id: 'ahead' },
    ];
    expect(nextWaiting(reviews, [topic(), other], today)?.id).toBe('old');
    expect(nextWaiting(reviews, [topic(), other], today, 'old')?.id).toBe('r-4');
    expect(nextWaiting(reviews, [topic(), other], today, 'r-4')?.id).toBe('old');
    expect(nextForTopic(reviews, 't1')?.id).toBe('old');
  });

  const base = { dayMark: 4 as const, justLockedIn: false, added: [], next: undefined };
  test('solid and fuzzy say when it comes back', () => {
    const next = review(7, '2026-11-18');
    expect(outcomeCopy({ ...base, recall: 'solid', next }, today)).toEqual({
      title: 'Lit',
      body: 'It comes back on Wed 18 Nov, day 7.',
    });
    expect(outcomeCopy({ ...base, recall: 'fuzzy', next }, today).title).toBe('Lit, a little hazy');
    expect(outcomeCopy({ ...base, dayMark: 7, recall: 'fuzzy' }, today).body).toMatch(/Nothing more is set/);
  });

  test('forgot is leaky, never a failure, and names the extra day', () => {
    const copy = outcomeCopy({ ...base, recall: 'forgot', added: [review('extra', '2026-11-16')] }, today);
    expect(copy.title).toBe('A little leaky');
    expect(copy.body).toContain('tomorrow');
    expect(copy.body).not.toMatch(/fail|wrong|missed/i);
  });

  test('locking in mentions graduation visits only when they were added', () => {
    expect(outcomeCopy({ ...base, dayMark: 7, recall: 'solid', justLockedIn: true }, today).body).toMatch(
      /will not ask/,
    );
    const added = [review(14, '2026-11-25'), review(30, '2026-12-11')];
    expect(outcomeCopy({ ...base, dayMark: 7, recall: 'solid', justLockedIn: true, added }, today).body).toContain(
      'on Wed 25 Nov and on Fri 11 Dec',
    );
  });

  test('a graduation review says it is still glowing', () => {
    expect(outcomeCopy({ ...base, dayMark: 30, recall: 'solid' }, today)).toEqual({
      title: 'Still glowing',
      body: 'That was its last visit. It is yours.',
    });
  });
});
