// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest';

import { localDate, type Review } from '../scheduler';

import type { ReminderSettings, ReminderTopic } from './plan';
import type { OutgoingReminder, ReminderPermission, ReminderPort } from './port';
import { clockKey, createReminderSync, syncReminders, toInstant, wallClock, type SyncState } from './sync';

function fakePort(permission: ReminderPermission = 'granted') {
  const calls: OutgoingReminder[][] = [];
  let release: (() => void) | null = null;
  const port: ReminderPort & { hold?: boolean } = {
    permission: async () => permission,
    requestPermission: async () => permission,
    exactTiming: async () => 'unavailable',
    openExactTimingSettings: async () => 'unavailable',
    replaceAll: async (reminders) => {
      calls.push([...reminders]);
      if (port.hold) await new Promise<void>((resolve) => (release = resolve));
    },
    onTap: () => () => undefined,
  };
  return { port, calls, release: () => release?.() };
}

const SETTINGS: ReminderSettings = {
  reminders: true,
  reminderTime: '19:30',
  dailyDigest: false,
  quietHours: { start: '22:00', end: '07:00' },
};
const TOPIC: ReminderTopic = { id: 'a', title: 'Closures', status: 'active', kind: 'concept' };
const review = (id: string, dueOn: string): Review => ({
  id,
  topicId: 'a',
  dayMark: 4,
  dueOn: localDate(dueOn),
  snoozedCount: 0,
  dueHistory: [],
});
const state = (reviews: Review[], settings = SETTINGS): SyncState => ({ reviews, topics: [TOPIC], settings });

// Built from local fields, so these tests hold in whatever zone they run in.
const NOW = new Date(2026, 10, 15, 10, 0);

afterEach(() => vi.restoreAllMocks());

describe('wall clock and instants', () => {
  test('wallClock reads the local calendar and clock', () => {
    expect(wallClock(new Date(2026, 10, 15, 7, 5))).toEqual({ date: '2026-11-15', time: '07:05' });
    expect(wallClock(new Date(2026, 11, 31, 23, 59))).toEqual({ date: '2026-12-31', time: '23:59' });
  });

  test('toInstant lands on that local date and time, and round-trips', () => {
    const at = { date: localDate('2026-11-18'), time: '19:30' };
    const instant = toInstant(at);
    expect([instant.getFullYear(), instant.getMonth(), instant.getDate()]).toEqual([2026, 10, 18]);
    expect([instant.getHours(), instant.getMinutes(), instant.getSeconds()]).toEqual([19, 30, 0]);
    expect(wallClock(instant)).toEqual(at);
  });

  test('clockKey changes with the local date', () => {
    expect(clockKey(new Date(2026, 10, 15, 23, 59))).not.toBe(clockKey(new Date(2026, 10, 16, 0, 0)));
    expect(clockKey(new Date(2026, 10, 15, 9, 0))).toBe(clockKey(new Date(2026, 10, 15, 21, 0)));
  });
});

describe('syncReminders', () => {
  test('replaces what is scheduled with the plan, as local instants', async () => {
    const { port, calls } = fakePort();
    const result = await syncReminders(port, state([review('r', '2026-11-18')]), NOW);
    expect(result).toEqual({ permission: 'granted', scheduled: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatchObject({ title: 'Closures', reviewId: 'r' });
    expect(calls[0]?.[0]?.at.getTime()).toBe(new Date(2026, 10, 18, 19, 30).getTime());
  });

  test('clears everything when reminders are switched off', async () => {
    const { port, calls } = fakePort();
    await syncReminders(port, state([review('r', '2026-11-18')], { ...SETTINGS, reminders: false }), NOW);
    expect(calls).toEqual([[]]);
  });

  test('clears everything and schedules nothing without permission', async () => {
    for (const permission of ['denied', 'prompt'] as const) {
      const { port, calls } = fakePort(permission);
      const result = await syncReminders(port, state([review('r', '2026-11-18')]), NOW);
      expect(result).toEqual({ permission, scheduled: 0 });
      expect(calls).toEqual([[]]);
    }
  });

  test('does not touch the notification system where it is unsupported', async () => {
    const { port, calls } = fakePort('unsupported');
    await syncReminders(port, state([review('r', '2026-11-18')]), NOW);
    expect(calls).toEqual([]);
  });

  test('nothing is ever scheduled in the past', async () => {
    const { port, calls } = fakePort();
    await syncReminders(port, state([review('a', '2026-11-10'), review('b', '2026-11-15')]), NOW);
    expect(calls[0]?.length).toBeGreaterThan(0);
    for (const r of calls[0] ?? []) expect(r.at.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe('createReminderSync', () => {
  test('requests made during a run fold into one follow-up with the latest state', async () => {
    const { port, calls, release } = fakePort();
    port.hold = true;
    let current = state([review('first', '2026-11-18')]);
    const sync = createReminderSync(
      port,
      () => current,
      () => NOW,
    );

    const done = sync.request();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    current = state([review('second', '2026-11-18')]);
    void sync.request();
    current = state([review('third', '2026-11-18')]);
    void sync.request();
    port.hold = false;
    release();
    await done;

    expect(calls.map((c) => c[0]?.reviewId)).toEqual(['first', 'third']);
  });

  test('a failing sync is reported quietly and the next one still runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { port, calls } = fakePort();
    const replaceAll = port.replaceAll;
    port.replaceAll = async () => {
      throw new Error('alarm service unavailable');
    };
    const sync = createReminderSync(
      port,
      () => state([review('r', '2026-11-18')]),
      () => NOW,
    );
    await sync.request();
    expect(warn).toHaveBeenCalledOnce();

    port.replaceAll = replaceAll;
    await sync.request();
    expect(calls).toHaveLength(1);
  });

  test('waits quietly while the data is not loaded, then runs once it is', async () => {
    const { port, calls } = fakePort();
    let current: SyncState | null = null;
    const sync = createReminderSync(
      port,
      () => current,
      () => NOW,
    );
    await sync.request();
    expect(calls).toEqual([]);

    current = state([review('r', '2026-11-18')]);
    await sync.request();
    await sync.request();
    expect(calls).toHaveLength(2);
  });
});
