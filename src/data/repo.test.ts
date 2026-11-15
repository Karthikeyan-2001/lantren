import { afterEach, describe, expect, test, vi } from 'vitest';

import { localDate, toLocalDate } from '../scheduler';

import { openDb, type LanternDB } from './db';
import {
  InvalidTopicError,
  InvalidTrackError,
  ReviewNotFoundError,
  addTrack,
  loadAll,
  recordReview,
  saveFocusSession,
  saveTopic,
  snoozeReviewById,
  updateSettings,
  updateTrack,
} from './repo';
import { createLanternStore } from './store';
import type { FocusSession, TopicInput } from './types';

let n = 0;
const opened: LanternDB[] = [];
function freshDb(): LanternDB {
  const db = openDb(`lantern-test-${++n}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await db.delete();
  }
  vi.restoreAllMocks();
});

// Sunday 15 November 2026, mid-morning local time.
const NOW = new Date(2026, 10, 15, 10, 30);
const TODAY = toLocalDate(NOW);

const input = (over: Partial<TopicInput> = {}): TopicInput => ({
  title: '  Closures and the event loop ',
  trackId: 'track-js',
  kind: 'concept',
  notes: ' a function remembers where it was made ',
  confidence: 3,
  studiedOn: TODAY,
  ...over,
});

describe('first run', () => {
  test('seeds six starter tracks in order and the default settings', async () => {
    const { tracks, topics, reviews, settings } = await loadAll(freshDb());
    expect(tracks).toHaveLength(6);
    expect(tracks.map((t) => t.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(tracks.map((t) => t.colour)).size).toBe(6);
    expect(topics).toEqual([]);
    expect(reviews).toEqual([]);
    expect(settings).toMatchObject({ reminderTime: '19:30', graduationReviews: false, lastTrackId: null });
  });

  test('does not seed twice when the database is opened again', async () => {
    const db = freshDb();
    await loadAll(db);
    db.close();
    await db.open();
    expect((await loadAll(db)).tracks).toHaveLength(6);
  });
});

describe('saveTopic', () => {
  test('stores the topic with day 4 and day 7 reviews', async () => {
    const db = freshDb();
    const { topic, reviews } = await saveTopic(db, input(), NOW);

    expect(topic).toMatchObject({
      title: 'Closures and the event loop',
      notes: 'a function remembers where it was made',
      status: 'active',
      studiedOn: '2026-11-15',
    });
    expect(reviews.map((r) => [r.dayMark, r.dueOn])).toEqual([
      [4, '2026-11-18'],
      [7, '2026-11-21'],
    ]);

    const stored = await loadAll(db);
    expect(stored.topics).toEqual([topic]);
    expect(stored.reviews).toHaveLength(2);
    expect(stored.reviews.every((r) => r.topicId === topic.id)).toBe(true);
    expect(stored.settings.lastTrackId).toBe('track-js');
  });

  test('a topic studied yesterday is due three and six days after yesterday', async () => {
    const { reviews } = await saveTopic(freshDb(), input({ studiedOn: localDate('2026-11-14') }), NOW);
    expect(reviews.map((r) => r.dueOn)).toEqual(['2026-11-17', '2026-11-20']);
  });

  test('keeps DSA details only for dsa-problem topics, trimmed', async () => {
    const db = freshDb();
    const dsa = { problemUrl: ' https://example.com/p ', pattern: ' ', minutesTaken: 25, solvedWithoutHints: true };
    const { topic: problem } = await saveTopic(db, input({ kind: 'dsa-problem', dsa }), NOW);
    expect(problem.dsa).toEqual({
      problemUrl: 'https://example.com/p',
      pattern: undefined,
      minutesTaken: 25,
      solvedWithoutHints: true,
    });
    const { topic: concept } = await saveTopic(db, input({ dsa }), NOW);
    expect(concept.dsa).toBeUndefined();
  });

  const invalid: [string, TopicInput][] = [
    ['an empty title', input({ title: '   ' })],
    ['a future study date', input({ studiedOn: localDate('2026-11-16') })],
    ['an unknown track', input({ trackId: 'track-nope' })],
  ];
  test.each(invalid)('rejects %s and writes nothing', async (_: string, bad: TopicInput) => {
    const db = freshDb();
    await expect(saveTopic(db, bad, NOW)).rejects.toBeInstanceOf(InvalidTopicError);
    const stored = await loadAll(db);
    expect(stored.topics).toEqual([]);
    expect(stored.reviews).toEqual([]);
  });

  test('if the reviews cannot be written, the topic is not kept either', async () => {
    const db = freshDb();
    await loadAll(db);
    vi.spyOn(db.reviews, 'bulkAdd').mockRejectedValue(new Error('disk full'));
    await expect(saveTopic(db, input(), NOW)).rejects.toThrow('disk full');
    vi.restoreAllMocks();
    const stored = await loadAll(db);
    expect(stored.topics).toEqual([]);
    expect(stored.settings.lastTrackId).toBeNull();
  });
});

describe('store', () => {
  test('loads, then a capture appears in memory with a note for Today', async () => {
    const store = createLanternStore(freshDb());
    await store.getState().load();
    expect(store.getState().status).toBe('ready');

    const topic = await store.getState().capture(input({ studiedOn: toLocalDate(new Date()) }));
    const state = store.getState();
    expect(state.topics).toEqual([topic]);
    expect(state.reviews).toHaveLength(2);
    expect(state.settings.lastTrackId).toBe('track-js');
    expect(state.notice).toMatch(/^“Closures and the event loop” is lit. Back on .* and on /);

    state.dismissNotice();
    expect(store.getState().notice).toBeNull();
  });
});

describe('recordReview', () => {
  // Studied 12 Nov, so day 4 is due today (15 Nov) and day 7 on 18 Nov.
  const studied = () => input({ studiedOn: localDate('2026-11-12') });
  const DAY7 = new Date(2026, 10, 18, 20, 0);

  test('Solid on day 4 lights it and leaves day 7 untouched', async () => {
    const db = freshDb();
    const { topic, reviews } = await saveTopic(db, studied(), NOW);
    const [day4, day7] = reviews;
    const outcome = await recordReview(db, day4!.id, 'solid', NOW);

    expect(outcome.review).toMatchObject({ id: day4!.id, recall: 'solid', doneAt: NOW.toISOString() });
    expect(outcome.added).toEqual([]);
    expect(outcome.justLockedIn).toBe(false);
    expect(outcome.topic.status).toBe('active');

    const stored = await loadAll(db);
    expect(stored.reviews.find((r) => r.id === day7!.id)).toEqual(day7);
    expect(stored.topics[0]).toEqual(topic);
  });

  test('Forgot adds one extra review tomorrow and marks the topic leaky', async () => {
    const db = freshDb();
    const { reviews } = await saveTopic(db, studied(), NOW);
    const outcome = await recordReview(db, reviews[0]!.id, 'forgot', NOW);

    expect(outcome.topic.status).toBe('leaky');
    expect(outcome.added.map((r) => [r.dayMark, r.dueOn])).toEqual([['extra', '2026-11-16']]);
    const stored = await loadAll(db);
    expect(stored.reviews).toHaveLength(3);
    expect(stored.topics[0]?.status).toBe('leaky');
  });

  test('Solid on day 7 locks the topic in, with no graduation reviews by default', async () => {
    const db = freshDb();
    const { reviews } = await saveTopic(db, studied(), NOW);
    await recordReview(db, reviews[0]!.id, 'fuzzy', NOW);
    const outcome = await recordReview(db, reviews[1]!.id, 'solid', DAY7);

    expect(outcome.justLockedIn).toBe(true);
    expect(outcome.topic.status).toBe('locked');
    expect(outcome.added).toEqual([]);
    expect((await loadAll(db)).topics[0]?.status).toBe('locked');
  });

  test('with graduation reviews on, locking in adds day 14 and day 30', async () => {
    const db = freshDb();
    await updateSettings(db, { graduationReviews: true });
    const { reviews } = await saveTopic(db, studied(), NOW);
    await recordReview(db, reviews[0]!.id, 'solid', NOW);
    const outcome = await recordReview(db, reviews[1]!.id, 'solid', DAY7);

    expect(outcome.added.map((r) => [r.dayMark, r.dueOn])).toEqual([
      [14, '2026-11-25'],
      [30, '2026-12-11'],
    ]);
    expect((await loadAll(db)).reviews).toHaveLength(4);
  });

  test('rating a review twice changes nothing the second time', async () => {
    const db = freshDb();
    const { reviews } = await saveTopic(db, studied(), NOW);
    const first = await recordReview(db, reviews[0]!.id, 'solid', NOW);
    const again = await recordReview(db, reviews[0]!.id, 'forgot', new Date(2026, 10, 15, 11));
    expect(again.review).toEqual(first.review);
    expect(again.added).toEqual([]);
    expect((await loadAll(db)).topics[0]?.status).toBe('active');
  });

  test('a missing review is a gentle error', async () => {
    await expect(recordReview(freshDb(), 'nope', 'solid', NOW)).rejects.toBeInstanceOf(ReviewNotFoundError);
  });

  test('if the extra review cannot be written, the rating is not kept either', async () => {
    const db = freshDb();
    const { reviews } = await saveTopic(db, studied(), NOW);
    vi.spyOn(db.reviews, 'bulkAdd').mockRejectedValue(new Error('disk full'));
    await expect(recordReview(db, reviews[0]!.id, 'forgot', NOW)).rejects.toThrow('disk full');
    vi.restoreAllMocks();
    const stored = await loadAll(db);
    expect(stored.reviews.find((r) => r.id === reviews[0]!.id)?.doneAt).toBeUndefined();
    expect(stored.topics[0]?.status).toBe('active');
  });
});

describe('snoozeReviewById', () => {
  test('moves a review due today to tomorrow and remembers where it was', async () => {
    const db = freshDb();
    const { reviews } = await saveTopic(db, input({ studiedOn: localDate('2026-11-12') }), NOW);
    const moved = await snoozeReviewById(db, reviews[0]!.id, NOW);
    expect(moved).toMatchObject({ dueOn: '2026-11-16', snoozedCount: 1, dueHistory: ['2026-11-15'] });
    expect((await loadAll(db)).reviews.find((r) => r.id === moved.id)).toEqual(moved);
  });
});

describe('store reviews', () => {
  test('a rating, a snooze and a setting show up in memory straight away', async () => {
    const store = createLanternStore(freshDb());
    await store.getState().load();
    const today = toLocalDate(new Date());
    const back3 = new Date();
    back3.setDate(back3.getDate() - 3);
    await store.getState().capture(input({ studiedOn: toLocalDate(back3) }));
    const [day4, day7] = store.getState().reviews;

    const outcome = await store.getState().review(day4!.id, 'forgot');
    let state = store.getState();
    expect(state.reviews).toHaveLength(3);
    expect(state.reviews.find((r) => r.id === day4!.id)?.recall).toBe('forgot');
    expect(state.topics[0]?.status).toBe('leaky');
    expect(outcome.added[0]!.dueOn > today).toBe(true);

    await store.getState().snooze(day7!.id);
    state = store.getState();
    expect(state.reviews.find((r) => r.id === day7!.id)?.snoozedCount).toBe(1);
    expect(state.notice).toMatch(/” will be back on /);

    await store.getState().updateSettings({ graduationReviews: true });
    expect(store.getState().settings.graduationReviews).toBe(true);
  });
});

describe('focus sessions', () => {
  const session = (over: Partial<FocusSession> = {}): FocusSession => ({
    id: 'focus-1',
    startedAt: NOW.toISOString(),
    endedAt: new Date(NOW.getTime() + 25 * 60_000).toISOString(),
    plannedMinutes: 25,
    focusedMinutes: 25,
    trackId: 'track-js',
    interruptions: 0,
    parkingLot: ['renew the domain'],
    ...over,
  });

  test('a finished session is stored and comes back on the next load, oldest first', async () => {
    const db = freshDb();
    const later = session({ id: 'focus-2', startedAt: new Date(NOW.getTime() + 3_600_000).toISOString() });
    await saveFocusSession(db, later);
    await saveFocusSession(db, session());
    expect((await loadAll(db)).focusSessions).toEqual([session(), later]);
  });

  test('saving the same session again replaces it', async () => {
    const db = freshDb();
    await saveFocusSession(db, session());
    await saveFocusSession(db, session({ focusedMinutes: 22, interruptions: 1 }));
    const stored = (await loadAll(db)).focusSessions;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.focusedMinutes).toBe(22);
  });

  test('the store keeps finished sessions in memory, and nothing if the write fails', async () => {
    const db = freshDb();
    const store = createLanternStore(db);
    await store.getState().load();
    await store.getState().logFocus(session());
    expect(store.getState().focusSessions).toEqual([session()]);

    vi.spyOn(db.focusSessions, 'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(store.getState().logFocus(session({ id: 'focus-2' }))).rejects.toThrow('disk full');
    expect(store.getState().focusSessions).toHaveLength(1);
  });

  test('settings from before focus mode pick up the focus defaults', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'settings', reminders: true } as never);
    const { settings } = await loadAll(db);
    expect(settings.reminders).toBe(true);
    expect(settings.focusMinutes).toBe(25);
    expect(settings.focusSound).toBe('off');
    expect(settings.focusChime).toBe(true);
  });
});

describe('tracks', () => {
  const base = { name: '  Rust for fun ', colour: 'clay' as const, weeklyTargetMinutes: 90 };

  test('a new track goes after the others, trimmed, with a concept default', async () => {
    const db = freshDb();
    const track = await addTrack(db, base, NOW);
    expect(track).toMatchObject({
      name: 'Rust for fun',
      colour: 'clay',
      weeklyTargetMinutes: 90,
      order: 6,
      defaultKind: 'concept',
      archived: false,
    });
    expect((await loadAll(db)).tracks.at(-1)).toEqual(track);
  });

  test('a track can be renamed, recoloured and retargeted, and topics stay with it', async () => {
    const db = freshDb();
    const { topic } = await saveTopic(db, input(), NOW);
    const edited = await updateTrack(db, 'track-js', { name: ' JS ', colour: 'dusk', weeklyTargetMinutes: 0 });
    expect(edited).toMatchObject({ name: 'JS', colour: 'dusk', weeklyTargetMinutes: 0, archived: false });
    expect((await loadAll(db)).topics.find((t) => t.id === topic.id)?.trackId).toBe('track-js');
  });

  test('refuses an empty or very long name, a bad colour and a silly target', async () => {
    const db = freshDb();
    await expect(addTrack(db, { ...base, name: '   ' }, NOW)).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(addTrack(db, { ...base, name: 'x'.repeat(61) }, NOW)).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(addTrack(db, { ...base, colour: 'neon' as never }, NOW)).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(addTrack(db, { ...base, weeklyTargetMinutes: -5 }, NOW)).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(addTrack(db, { ...base, weeklyTargetMinutes: 2401 }, NOW)).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(addTrack(db, { ...base, weeklyTargetMinutes: 30.5 }, NOW)).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(updateTrack(db, 'track-js', { name: '' })).rejects.toBeInstanceOf(InvalidTrackError);
    await expect(updateTrack(db, 'track-nowhere', { name: 'x' })).rejects.toBeInstanceOf(InvalidTrackError);
    expect((await loadAll(db)).tracks).toHaveLength(6);
  });

  test('a track can be put away and brought back, but the last one in view stays', async () => {
    const db = freshDb();
    const ids = (await loadAll(db)).tracks.map((t) => t.id);
    for (const id of ids.slice(1)) await updateTrack(db, id, { archived: true });
    await expect(updateTrack(db, ids[0]!, { archived: true })).rejects.toThrow('Keep at least one track in view.');
    expect((await loadAll(db)).tracks.filter((t) => !t.archived).map((t) => t.id)).toEqual([ids[0]]);
    expect(await updateTrack(db, ids[1]!, { archived: false })).toMatchObject({ archived: false });
  });

  test('the store keeps tracks in step with what was saved', async () => {
    const store = createLanternStore(freshDb());
    await store.getState().load();
    const added = await store.getState().addTrack(base);
    await store.getState().editTrack(added.id, { name: 'Rust' });
    await store.getState().editTrack('track-dsa', { archived: true });
    const { tracks } = store.getState();
    expect(tracks.find((t) => t.id === added.id)?.name).toBe('Rust');
    expect(tracks.find((t) => t.id === 'track-dsa')?.archived).toBe(true);
    expect(tracks).toHaveLength(7);
  });

  test('the store restores a backup and deletes everything', async () => {
    const store = createLanternStore(freshDb());
    await store.getState().load();
    await store.getState().capture(input());
    const snapshot = await loadAll(freshDb());
    await store.getState().restore({ ...snapshot, focusSessions: [] });
    expect(store.getState().topics).toEqual([]);
    await store.getState().capture(input());
    await store.getState().wipe();
    expect(store.getState().topics).toEqual([]);
    expect(store.getState().reviews).toEqual([]);
    expect(store.getState().notice).toBeNull();
    expect(store.getState().tracks).toHaveLength(6);
  });
});
