// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  completionWords,
  formatMinutes,
  heatmapLabel,
  hoursText,
  hoursToMinutes,
  streakLine,
  streakUnit,
  weekLine,
} from './copy';

describe('minutes in words', () => {
  test('under an hour, whole hours, and both', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(150)).toBe('2 h 30 min');
    expect(formatMinutes(-5)).toBe('0 min');
    expect(formatMinutes(59.6)).toBe('1 h');
  });
});

test('hours for the ring', () => {
  expect([0, 30, 150, 600, 59, -10].map(hoursText)).toEqual(['0', '0.5', '2.5', '10', '1', '0']);
});

test('a typed target in hours becomes minutes, or nothing', () => {
  expect(['2', '1.5', '0', ' 0.25 ', '40'].map(hoursToMinutes)).toEqual([120, 90, 0, 15, 2400]);
  expect(['', '  ', 'abc', '-1', '41', 'Infinity'].map(hoursToMinutes)).toEqual([null, null, null, null, null, null]);
});

describe('the streak line', () => {
  test('a fresh start is an invitation', () => {
    expect(streakLine({ days: 0, todayDone: false, restAvailable: true })).toMatch(/fresh start/);
  });

  test('lit today says whether the rest day is still held', () => {
    expect(streakLine({ days: 3, todayDone: true, restAvailable: true })).toBe(
      'Lit today. A rest day is still held for this week.',
    );
    expect(streakLine({ days: 3, todayDone: true, restAvailable: false })).toBe(
      'Lit today. This week’s rest day has been used.',
    );
  });

  test('not yet today is never a scolding', () => {
    const held = streakLine({ days: 3, todayDone: false, restAvailable: true });
    expect(held).toMatch(/that is fine/);
    expect(streakLine({ days: 3, todayDone: false, restAvailable: false })).toMatch(/Something small today/);
    for (const line of [held, streakLine({ days: 0, todayDone: false, restAvailable: false })]) {
      expect(line).not.toMatch(/lost|broke|fail|miss|don’t|don't/i);
    }
  });

  test('day and days', () => {
    expect(streakUnit(1)).toBe('day');
    expect(streakUnit(0)).toBe('days');
    expect(streakUnit(12)).toBe('days');
  });
});

describe('the week line', () => {
  test('nothing yet is an invitation, not a zero', () => {
    expect(weekLine({ totalMinutes: 0, totalTargetMinutes: 570 })).toBe(
      'No focus yet this week. A short session starts it.',
    );
  });

  test('time against the target, or alone when there is no target', () => {
    expect(weekLine({ totalMinutes: 150, totalTargetMinutes: 570 })).toBe('2 h 30 min of 9 h 30 min this week');
    expect(weekLine({ totalMinutes: 150, totalTargetMinutes: 0 })).toBe('2 h 30 min this week');
  });
});

describe('review completion and the heatmap', () => {
  test('a percentage with what it is out of', () => {
    expect(completionWords({ due: 8, done: 6, rate: 0.75 })).toEqual({
      value: '75%',
      note: '6 of 8 reviews done in the last four weeks.',
    });
    expect(completionWords({ due: 1, done: 1, rate: 1 }).note).toBe('1 of 1 review done in the last four weeks.');
    expect(completionWords({ due: 0, done: 0, rate: null }).value).toBe('–');
  });

  test('the heatmap label counts study days', () => {
    expect(heatmapLabel(0, 12)).toBe('No study days in the last 12 weeks yet.');
    expect(heatmapLabel(1, 12)).toBe('1 study day in the last 12 weeks.');
    expect(heatmapLabel(31, 12)).toBe('31 study days in the last 12 weeks.');
  });
});
