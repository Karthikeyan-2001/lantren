// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { addDays, compareDates, daysBetween, isLocalDate, laterOf, localDate, toLocalDate } from './dates';

const d = localDate;

describe('local date parsing', () => {
  test('accepts real calendar dates', () => {
    expect(isLocalDate('2026-11-15')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
  });

  test('rejects impossible or malformed dates', () => {
    for (const bad of [
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-11-31',
      '2026-1-5',
      '15-11-2026',
      '',
      20261115,
    ]) {
      expect(isLocalDate(bad)).toBe(false);
    }
    expect(() => localDate('2026-02-30')).toThrow(RangeError);
  });
});

describe('calendar arithmetic', () => {
  test('adds days within a month', () => {
    expect(addDays(d('2026-11-15'), 3)).toBe('2026-11-18');
    expect(addDays(d('2026-11-15'), 6)).toBe('2026-11-21');
  });

  test('rolls over month, year and leap day', () => {
    expect(addDays(d('2026-11-28'), 3)).toBe('2026-12-01');
    expect(addDays(d('2026-12-29'), 6)).toBe('2027-01-04');
    expect(addDays(d('2028-02-27'), 3)).toBe('2028-03-01');
    expect(addDays(d('2027-02-27'), 3)).toBe('2027-03-02');
  });

  test('subtracts days', () => {
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
    expect(addDays(d('2026-01-01'), -1)).toBe('2025-12-31');
  });

  test('add then subtract returns to the start across many years', () => {
    let date = d('2024-01-01');
    for (let i = 0; i < 1500; i++) {
      const next = addDays(date, 1);
      expect(daysBetween(date, next)).toBe(1);
      expect(addDays(next, -1)).toBe(date);
      date = next;
    }
    expect(date).toBe('2028-02-09');
  });

  test('counts days between dates and compares them', () => {
    expect(daysBetween(d('2026-11-15'), d('2026-11-21'))).toBe(6);
    expect(daysBetween(d('2026-11-21'), d('2026-11-15'))).toBe(-6);
    expect(compareDates(d('2026-11-15'), d('2026-11-16'))).toBe(-1);
    expect(compareDates(d('2026-11-15'), d('2026-11-15'))).toBe(0);
    expect(laterOf(d('2026-11-15'), d('2026-12-01'))).toBe('2026-12-01');
  });
});

describe('what date is it here, now', () => {
  test('Chennai: one second before and after local midnight', () => {
    const justBefore = new Date('2026-11-15T23:59:59+05:30');
    const justAfter = new Date('2026-11-16T00:00:00+05:30');
    expect(toLocalDate(justBefore, 'Asia/Kolkata')).toBe('2026-11-15');
    expect(toLocalDate(justAfter, 'Asia/Kolkata')).toBe('2026-11-16');
  });

  test('Chennai early morning is not the UTC date', () => {
    // 02:00 IST on the 16th is still the 15th in UTC. The local date must win.
    const earlyMorning = new Date('2026-11-16T02:00:00+05:30');
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-11-15');
    expect(toLocalDate(earlyMorning, 'Asia/Kolkata')).toBe('2026-11-16');
  });

  test('the same instant is a different date in a different zone', () => {
    const instant = new Date('2026-11-15T20:00:00Z');
    expect(toLocalDate(instant, 'Asia/Kolkata')).toBe('2026-11-16');
    expect(toLocalDate(instant, 'America/Los_Angeles')).toBe('2026-11-15');
    expect(toLocalDate(instant, 'Pacific/Auckland')).toBe('2026-11-16');
  });

  test('spring-forward day (23 hours long) is still one calendar day', () => {
    // New York skips 02:00 to 03:00 on 2026-03-08.
    expect(toLocalDate(new Date('2026-03-08T00:30:00-05:00'), 'America/New_York')).toBe('2026-03-08');
    expect(toLocalDate(new Date('2026-03-08T23:30:00-04:00'), 'America/New_York')).toBe('2026-03-08');
    expect(toLocalDate(new Date('2026-03-09T00:00:00-04:00'), 'America/New_York')).toBe('2026-03-09');
    expect(addDays(d('2026-03-07'), 1)).toBe('2026-03-08');
    expect(addDays(d('2026-03-07'), 2)).toBe('2026-03-09');
  });

  test('fall-back day (25 hours long) is still one calendar day', () => {
    // New York repeats 01:00 to 02:00 on 2026-11-01.
    expect(toLocalDate(new Date('2026-11-01T00:30:00-04:00'), 'America/New_York')).toBe('2026-11-01');
    expect(toLocalDate(new Date('2026-11-01T23:59:59-05:00'), 'America/New_York')).toBe('2026-11-01');
    expect(toLocalDate(new Date('2026-11-02T00:00:00-05:00'), 'America/New_York')).toBe('2026-11-02');
  });

  test('uses the device zone when none is given', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(toLocalDate(now)).toBe(toLocalDate(now, deviceZone));
  });
});
