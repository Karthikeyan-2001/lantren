import { afterEach, describe, expect, test, vi } from 'vitest';

import { toLocalDate } from '../scheduler';

import {
  BACKUP_VERSION,
  backupFileName,
  buildBackup,
  countBackup,
  describeCounts,
  parseBackup,
  serializeBackup,
} from './backup';
import { openDb, type LanternDB } from './db';
import { loadAll, recordReview, replaceAll, saveFocusSession, saveTopic, updateSettings, wipeAll } from './repo';
import { DEFAULT_SETTINGS } from './seed';
import type { FocusSession, TopicInput } from './types';

let n = 0;
const opened: LanternDB[] = [];
function freshDb(): LanternDB {
  const db = openDb(`lantern-backup-test-${++n}`);
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

const NOW = new Date(2026, 10, 15, 10, 30);
const input = (over: Partial<TopicInput> = {}): TopicInput => ({
  title: 'Closures and the event loop',
  trackId: 'track-js',
  kind: 'concept',
  notes: 'a function remembers where it was made',
  confidence: 3,
  studiedOn: toLocalDate(new Date(2026, 10, 12)),
  ...over,
});
const session: FocusSession = {
  id: 'focus-1',
  startedAt: new Date(2026, 10, 14, 19, 0).toISOString(),
  endedAt: new Date(2026, 10, 14, 19, 25).toISOString(),
  plannedMinutes: 25,
  focusedMinutes: 25,
  trackId: 'track-js',
  interruptions: 1,
  parkingLot: ['renew the domain'],
};

/** A database with a bit of everything in it. */
async function lived(): Promise<LanternDB> {
  const db = freshDb();
  const { reviews } = await saveTopic(db, input(), NOW);
  await saveTopic(
    db,
    input({
      title: 'Two sum',
      trackId: 'track-dsa',
      kind: 'dsa-problem',
      dsa: { pattern: 'hash map', minutesTaken: 20, solvedWithoutHints: true },
      sourceUrl: 'https://example.com',
    }),
    NOW,
  );
  await recordReview(db, reviews[0]!.id, 'forgot', NOW);
  await saveFocusSession(db, session);
  await updateSettings(db, { reminders: true, reminderTime: '20:15', quietHours: null, focusSound: 'rain' });
  return db;
}

const parse = async (db: LanternDB) => parseBackup(serializeBackup(buildBackup(await loadAll(db), NOW)));

describe('writing a backup', () => {
  test('carries the version, the time and everything stored', async () => {
    const db = await lived();
    const snapshot = await loadAll(db);
    const backup = buildBackup(snapshot, NOW);
    expect(backup).toMatchObject({ app: 'lantern', version: BACKUP_VERSION, exportedAt: NOW.toISOString() });
    expect(countBackup(backup)).toEqual({ tracks: 6, topics: 2, reviews: 5, focusSessions: 1 });
  });

  test('says what it holds in words', () => {
    expect(describeCounts({ tracks: 6, topics: 12, reviews: 31, focusSessions: 4 })).toBe(
      '12 topics, 31 reviews and 4 focus sessions',
    );
    expect(describeCounts({ tracks: 1, topics: 1, reviews: 1, focusSessions: 1 })).toBe(
      '1 topic, 1 review and 1 focus session',
    );
  });

  test('is named for the local day', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 59))).toBe('lantern-backup-2026-11-05.json');
  });
});

describe('reading it back', () => {
  test('gives back exactly what was written', async () => {
    const db = await lived();
    const snapshot = await loadAll(db);
    const result = await parse(db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.tracks).toEqual(snapshot.tracks);
    expect(result.backup.topics).toEqual(snapshot.topics);
    expect(result.backup.reviews).toEqual(snapshot.reviews);
    expect(result.backup.focusSessions).toEqual(snapshot.focusSessions);
    expect(result.backup.settings).toEqual(snapshot.settings);
    expect(result.backup.exportedAt).toBe(NOW.toISOString());
  });

  test('restoring it on another device reproduces everything', async () => {
    const source = await lived();
    const result = await parse(source);
    if (!result.ok) throw new Error(result.reason);

    const target = freshDb();
    await saveTopic(target, input({ title: 'Something already here' }), NOW);
    await replaceAll(target, result.backup);
    expect(await loadAll(target)).toEqual(await loadAll(source));
  });

  test('the same review can be restored twice without doubling anything', async () => {
    const result = await parse(await lived());
    if (!result.ok) throw new Error(result.reason);
    const target = freshDb();
    await replaceAll(target, result.backup);
    await replaceAll(target, result.backup);
    expect((await loadAll(target)).reviews).toHaveLength(5);
  });

  test('a backup from before focus sessions, with older settings, still restores', async () => {
    const db = await lived();
    const raw = JSON.parse(serializeBackup(buildBackup(await loadAll(db), NOW))) as Record<string, unknown>;
    delete raw.focusSessions;
    raw.settings = { id: 'settings', reminders: true, graduationReviews: true };
    const result = parseBackup(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.focusSessions).toEqual([]);
    expect(result.backup.settings).toEqual({ ...DEFAULT_SETTINGS, reminders: true, graduationReviews: true });
  });
});

describe('settings are read leniently', () => {
  const withSettings = async (settings: unknown) => {
    const raw = JSON.parse(serializeBackup(buildBackup(await loadAll(await lived()), NOW))) as Record<string, unknown>;
    raw.settings = settings;
    const result = parseBackup(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.reason);
    return result.backup.settings;
  };

  test('a bad field falls back to its default and the rest are kept', async () => {
    const settings = await withSettings({
      reminders: 'yes',
      reminderTime: '25:99',
      graduationReviews: true,
      quietHours: { start: '23:00', end: 'late' },
      focusMinutes: 3,
      focusSound: 'thunder',
      focusVolume: 4,
      focusSleepFade: 20,
      focusChime: false,
    });
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, graduationReviews: true, focusChime: false });
  });

  test('good values are kept, including no quiet hours at all', async () => {
    const settings = await withSettings({
      reminderTime: '06:45',
      quietHours: null,
      focusMinutes: 50,
      focusSound: 'hum',
      focusVolume: 0.2,
      focusSleepFade: 30,
      lastTrackId: 'track-ai',
      focusTrackId: 'track-nowhere',
    });
    expect(settings).toMatchObject({
      reminderTime: '06:45',
      quietHours: null,
      focusMinutes: 50,
      focusSound: 'hum',
      focusVolume: 0.2,
      focusSleepFade: 30,
      lastTrackId: 'track-ai',
      focusTrackId: null,
    });
  });

  test('settings that are not an object become the defaults', async () => {
    expect(await withSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(await withSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('refusing what is not a Lantern backup', () => {
  const good = async (): Promise<Record<string, any>> =>
    JSON.parse(serializeBackup(buildBackup(await loadAll(await lived()), NOW)));
  const reason = (value: unknown) => {
    const result = parseBackup(typeof value === 'string' ? value : JSON.stringify(value));
    if (result.ok) throw new Error('expected a refusal');
    return result.reason;
  };

  test('text that is not JSON, or JSON that is not ours', async () => {
    expect(reason('hello')).toMatch(/does not look like a Lantern backup/);
    expect(reason('')).toMatch(/does not look like a Lantern backup/);
    expect(reason([])).toMatch(/does not look like a Lantern backup/);
    expect(reason({ app: 'other', version: 1 })).toMatch(/does not look like a Lantern backup/);
    expect(reason({ ...(await good()), version: 'one' })).toMatch(/does not look like a Lantern backup/);
  });

  test('a backup from a newer Lantern says to update, an unknown old one is refused', async () => {
    expect(reason({ ...(await good()), version: 2 })).toMatch(/newer version of Lantern/);
    expect(reason({ ...(await good()), version: 0 })).toMatch(/does not look like a Lantern backup/);
  });

  test('a missing list', async () => {
    const raw = await good();
    delete raw.topics;
    expect(reason(raw)).toMatch(/topic list is missing/);
  });

  test('a record that cannot be read names which one', async () => {
    const raw = await good();
    raw.topics[1].confidence = 9;
    expect(reason(raw)).toBe('This backup looks damaged: topic 2 could not be read.');

    const bad = await good();
    bad.reviews[0].dueOn = '2026-02-30';
    expect(reason(bad)).toBe('This backup looks damaged: review 1 could not be read.');

    const badTrack = await good();
    badTrack.tracks[2].colour = 'neon';
    expect(reason(badTrack)).toBe('This backup looks damaged: track 3 could not be read.');

    const badSession = await good();
    badSession.focusSessions[0].parkingLot = [1];
    expect(reason(badSession)).toBe('This backup looks damaged: focus session 1 could not be read.');
  });

  test('a record that points at something missing', async () => {
    const topic = await good();
    topic.topics[0].trackId = 'track-nowhere';
    expect(reason(topic)).toMatch(/topic belongs to a track that is not in the file/);

    const review = await good();
    review.reviews[0].topicId = 'topic-nowhere';
    expect(reason(review)).toMatch(/review belongs to a topic that is not in the file/);
  });

  test('the same id twice, and no tracks at all', async () => {
    const dup = await good();
    dup.topics.push({ ...dup.topics[0] });
    expect(reason(dup)).toMatch(/the same topic appears twice/);

    const none = await good();
    none.tracks = [];
    none.topics = [];
    none.reviews = [];
    expect(reason(none)).toMatch(/no tracks/);
  });

  test('a session whose track or topic is gone keeps its minutes and loses the link', async () => {
    const raw = await good();
    raw.focusSessions[0].trackId = 'track-nowhere';
    raw.focusSessions[0].topicId = 'topic-nowhere';
    const result = parseBackup(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.focusSessions[0]).toMatchObject({
      focusedMinutes: 25,
      trackId: undefined,
      topicId: undefined,
    });
  });

  test('a file far too large is refused before it is read', () => {
    expect(reason('x'.repeat(25_000_001))).toMatch(/much larger/);
  });
});

describe('replacing and deleting everything', () => {
  test('a restore that fails part-way changes nothing', async () => {
    const db = await lived();
    const before = await loadAll(db);
    const result = await parse(await lived());
    if (!result.ok) throw new Error(result.reason);

    vi.spyOn(db.focusSessions, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(replaceAll(db, result.backup)).rejects.toThrow('disk full');
    expect(await loadAll(db)).toEqual(before);
  });

  test('delete everything leaves a first-run app: starter tracks, default settings, nothing else', async () => {
    const db = await lived();
    await wipeAll(db, NOW);
    const after = await loadAll(db);
    expect(after.topics).toEqual([]);
    expect(after.reviews).toEqual([]);
    expect(after.focusSessions).toEqual([]);
    expect(after.settings).toEqual(DEFAULT_SETTINGS);
    expect(after.tracks.map((t) => t.id)).toEqual([
      'track-dsa',
      'track-ai',
      'track-ml',
      'track-js',
      'track-web',
      'track-sd',
    ]);
    expect(after.tracks.every((t) => !t.archived)).toBe(true);
  });

  test('delete everything that fails part-way keeps the data', async () => {
    const db = await lived();
    const before = await loadAll(db);
    vi.spyOn(db.settings, 'add').mockRejectedValueOnce(new Error('disk full'));
    await expect(wipeAll(db, NOW)).rejects.toThrow('disk full');
    expect(await loadAll(db)).toEqual(before);
  });
});
