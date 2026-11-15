// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { focusSummary, minutesWord } from './copy';
import type { FinishedFocus } from './session';

const session = (over: Partial<FinishedFocus> = {}): FinishedFocus => ({
  id: 'focus-1',
  startedAt: '2026-11-15T14:00:00.000Z',
  endedAt: '2026-11-15T14:25:00.000Z',
  plannedMinutes: 25,
  focusedMinutes: 25,
  interruptions: 0,
  parkingLot: [],
  ...over,
});

describe('the done card', () => {
  test('a full session', () => {
    expect(focusSummary(session(), true, 'DSA in JavaScript')).toEqual({
      title: 'That was good work',
      body: '25 minutes on DSA in JavaScript.',
    });
    expect(focusSummary(session(), true).body).toBe('25 minutes.');
  });

  test('time away is stated plainly, without blame', () => {
    expect(focusSummary(session({ focusedMinutes: 21, interruptions: 1 }), true, 'System design').body).toBe(
      '21 of 25 minutes focused on System design. You stepped away once and came back.',
    );
    expect(focusSummary(session({ focusedMinutes: 20, interruptions: 2 }), true).body).toMatch(/twice/);
    expect(focusSummary(session({ focusedMinutes: 15, interruptions: 5 }), true).body).toMatch(/5 times/);
  });

  test('an early stop still counts', () => {
    expect(focusSummary(session({ focusedMinutes: 12 }), false, 'ML foundations')).toEqual({
      title: 'Stopped at 12 minutes',
      body: 'That still counts toward ML foundations.',
    });
    expect(focusSummary(session({ focusedMinutes: 1 }), false)).toEqual({
      title: 'Stopped at 1 minute',
      body: 'That still counts.',
    });
  });

  test('minutes are counted in words that agree', () => {
    expect(minutesWord(1)).toBe('1 minute');
    expect(minutesWord(90)).toBe('90 minutes');
  });
});
