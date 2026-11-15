// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import type { FinishedFocus } from './session';
import { createFocusStore } from './store';

const MIN = 60_000;
const T0 = new Date(2026, 10, 15, 19, 30).getTime();

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function setup(
  options: { save?: (s: FinishedFocus) => Promise<void>; storage?: ReturnType<typeof memoryStorage> } = {},
) {
  const clock = { now: T0 };
  const saved: FinishedFocus[] = [];
  const storage = options.storage ?? memoryStorage();
  let n = 0;
  const store = createFocusStore({
    now: () => clock.now,
    newId: () => `run-${++n}`,
    save:
      options.save ??
      (async (s) => {
        saved.push(s);
      }),
    storage,
  });
  const at = (minutes: number) => {
    clock.now = T0 + minutes * MIN;
  };
  return { store, clock, at, saved, storage };
}

/** Lets the save promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a focus session, start to finish', () => {
  test('runs, ends on its own when the timer reaches zero, and is saved once', async () => {
    const { store, at, saved } = setup();
    store.getState().begin({ minutes: 25, trackId: 'track-js' });
    expect(store.getState().phase).toBe('focus');

    at(24.9);
    store.getState().tick();
    expect(store.getState().phase).toBe('focus');

    at(25);
    store.getState().tick();
    store.getState().tick();
    const state = store.getState();
    expect(state.phase).toBe('done');
    expect(state.completed).toBe(true);
    expect(state.run).toBeNull();
    expect(state.session?.focusedMinutes).toBe(25);

    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.trackId).toBe('track-js');
    expect(store.getState().saved).toBe('saved');
  });

  test('refuses a length outside the limits, and a second session over a running one', () => {
    const { store } = setup();
    store.getState().begin({ minutes: 2 });
    expect(store.getState().phase).toBe('idle');
    store.getState().begin({ minutes: 25 });
    const first = store.getState().run;
    store.getState().begin({ minutes: 50 });
    expect(store.getState().run).toBe(first);
  });

  test('pause, park a thought, resume, stop early: kept with what was done', async () => {
    const { store, at, saved } = setup();
    store.getState().begin({ minutes: 50 });
    at(10);
    store.getState().pause();
    store.getState().park('reply to Priya');
    at(30);
    store.getState().tick();
    expect(store.getState().phase).toBe('focus');
    store.getState().resume();
    at(42);
    store.getState().endEarly();

    const state = store.getState();
    expect(state.phase).toBe('done');
    expect(state.completed).toBe(false);
    expect(state.session?.focusedMinutes).toBe(22);
    expect(state.session?.parkingLot).toEqual(['reply to Priya']);
    await settle();
    expect(saved).toHaveLength(1);
  });

  test('stopping in the first minute keeps nothing and goes back to the start', async () => {
    const { store, at, saved, storage } = setup();
    store.getState().begin({ minutes: 25 });
    at(0.5);
    store.getState().endEarly();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().session).toBeNull();
    await settle();
    expect(saved).toHaveLength(0);
    expect(storage.items.size).toBe(0);
  });

  test('leaving and coming back is one interruption; time away is not focused time', () => {
    const { store, at } = setup();
    store.getState().begin({ minutes: 25 });
    at(5);
    store.getState().leave();
    at(9);
    store.getState().comeBack();
    expect(store.getState().run?.interruptions).toBe(1);
    at(25);
    store.getState().tick();
    expect(store.getState().session?.focusedMinutes).toBe(21);
    expect(store.getState().session?.interruptions).toBe(1);
  });

  test('coming back after the timer ran out finishes the session there and then', () => {
    const { store, at } = setup();
    store.getState().begin({ minutes: 25 });
    at(20);
    store.getState().leave();
    at(90);
    store.getState().comeBack();
    const state = store.getState();
    expect(state.phase).toBe('done');
    expect(state.completed).toBe(true);
    expect(state.session?.focusedMinutes).toBe(20);
    expect(state.session?.endedAt).toBe(new Date(T0 + 25 * MIN).toISOString());
  });
});

describe('saving', () => {
  test('a failed save says so and can be tried again', async () => {
    const save = vi
      .fn<(s: FinishedFocus) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { store, at } = setup({ save });
    store.getState().begin({ minutes: 25 });
    at(25);
    store.getState().tick();
    await settle();
    expect(store.getState().saved).toBe('failed');
    expect(store.getState().phase).toBe('done');

    store.getState().retrySave();
    await settle();
    expect(store.getState().saved).toBe('saved');
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toBe(save.mock.calls[0]?.[0]);
    warn.mockRestore();
  });
});

describe('breaks', () => {
  test('a break counts down on the wall clock and then waits to be picked up', () => {
    const { store, at } = setup();
    store.getState().begin({ minutes: 25 });
    at(25);
    store.getState().tick();
    store.getState().startBreak(5);
    expect(store.getState().phase).toBe('break');
    expect(store.getState().breakEndsAt).toBe(T0 + 30 * MIN);

    at(29.9);
    store.getState().tick();
    expect(store.getState().phase).toBe('break');
    at(30);
    store.getState().tick();
    expect(store.getState().phase).toBe('breakOver');
    expect(store.getState().breakMinutes).toBe(5);

    store.getState().reset();
    expect(store.getState().phase).toBe('idle');
  });

  test('a break can be skipped, and cannot start without a finished session', () => {
    const { store, at } = setup();
    store.getState().startBreak(5);
    expect(store.getState().phase).toBe('idle');
    store.getState().begin({ minutes: 25 });
    store.getState().startBreak(5);
    expect(store.getState().phase).toBe('focus');
    at(25);
    store.getState().tick();
    store.getState().startBreak(15);
    store.getState().skipBreak();
    expect(store.getState().phase).toBe('idle');
  });

  test('reset never throws away a running session', () => {
    const { store } = setup();
    store.getState().begin({ minutes: 25 });
    store.getState().reset();
    expect(store.getState().phase).toBe('focus');
  });
});

describe('surviving a restart', () => {
  test('a running session is picked up by a fresh store, with the gap counted as away', () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.store.getState().begin({ minutes: 50, topicId: 'topic-1' });
    first.at(1);
    first.store.getState().park('water the plants');
    first.at(6);
    first.store.getState().tick();

    // The app is killed at minute 6 and opened again at minute 16.
    const second = setup({ storage });
    second.at(16);
    second.store.getState().restore();
    const run = second.store.getState().run;
    expect(second.store.getState().phase).toBe('focus');
    expect(run?.topicId).toBe('topic-1');
    expect(run?.parkingLot).toEqual(['water the plants']);
    expect(run?.interruptions).toBe(1);
    expect(run?.awayMs).toBe(10 * MIN);
  });

  test('a session that ran out while the app was closed opens on its done card', async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.store.getState().begin({ minutes: 25 });
    first.at(10);
    first.store.getState().leave();

    const second = setup({ storage });
    second.at(300);
    second.store.getState().restore();
    expect(second.store.getState().phase).toBe('done');
    expect(second.store.getState().session?.focusedMinutes).toBe(10);
    await settle();
    expect(second.saved).toHaveLength(1);
    expect(storage.items.size).toBe(0);
  });

  test('nothing stored, or something unreadable, starts fresh', () => {
    const storage = memoryStorage();
    storage.setItem('lantern.focus', '{"broken":');
    const { store } = setup({ storage });
    store.getState().restore();
    expect(store.getState().phase).toBe('idle');
  });

  test('a finished session leaves nothing behind in storage', () => {
    const { store, at, storage } = setup();
    store.getState().begin({ minutes: 25 });
    expect(storage.items.size).toBe(1);
    at(25);
    store.getState().tick();
    expect(storage.items.size).toBe(0);
  });
});
