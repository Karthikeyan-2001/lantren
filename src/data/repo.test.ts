import { afterEach, describe, expect, test, vi } from 'vitest';

import { localDate, toLocalDate } from '../scheduler';

import { openDb, type LanternDB } from './db';
import { InvalidTopicError, loadAll, saveTopic } from './repo';
import { createLanternStore } from './store';
import type { TopicInput } from './types';

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
    expect(state.lastCapture).toMatchObject({ topicId: topic.id, title: 'Closures and the event loop' });

    state.dismissLastCapture();
    expect(store.getState().lastCapture).toBeNull();
  });
});
