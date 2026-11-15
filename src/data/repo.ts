/**
 * Every read and write of the database goes through here. Scheduling decisions are
 * the scheduler's; this module only stores what it returns.
 */
import { createReviews, isLocalDate, toLocalDate } from '../scheduler';

import type { LanternDB } from './db';
import { newId } from './ids';
import { DEFAULT_SETTINGS } from './seed';
import type { Review, Settings, Topic, TopicInput, Track } from './types';

export interface Snapshot {
  tracks: Track[];
  topics: Topic[];
  reviews: Review[];
  settings: Settings;
}

export async function loadAll(db: LanternDB): Promise<Snapshot> {
  return db.transaction('r', [db.tracks, db.topics, db.reviews, db.settings], async () => {
    const [tracks, topics, reviews, settings] = await Promise.all([
      db.tracks.orderBy('order').toArray(),
      db.topics.toArray(),
      db.reviews.toArray(),
      db.settings.get('settings'),
    ]);
    return { tracks, topics, reviews, settings: { ...DEFAULT_SETTINGS, ...settings } };
  });
}

export class InvalidTopicError extends Error {}

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Saves a newly studied topic and its day 4 and day 7 reviews in one transaction:
 * either all of it is stored or none of it is.
 */
export async function saveTopic(
  db: LanternDB,
  input: TopicInput,
  now: Date,
): Promise<{ topic: Topic; reviews: Review[] }> {
  const title = input.title.trim();
  if (!title) throw new InvalidTopicError('A topic needs a title.');
  if (!isLocalDate(input.studiedOn)) throw new InvalidTopicError('Study date is not a calendar date.');
  if (input.studiedOn > toLocalDate(now)) throw new InvalidTopicError('Study date is in the future.');

  const stamp = now.toISOString();
  const topic: Topic = {
    id: newId(),
    title,
    trackId: input.trackId,
    kind: input.kind,
    notes: input.notes.trim(),
    confidence: input.confidence,
    sourceUrl: clean(input.sourceUrl),
    dsa:
      input.kind === 'dsa-problem' && input.dsa
        ? {
            problemUrl: clean(input.dsa.problemUrl),
            pattern: clean(input.dsa.pattern),
            minutesTaken: input.dsa.minutesTaken,
            solvedWithoutHints: input.dsa.solvedWithoutHints,
          }
        : undefined,
    studiedOn: input.studiedOn,
    status: 'active',
    createdAt: stamp,
    updatedAt: stamp,
  };
  const reviews = createReviews(topic, newId);

  await db.transaction('rw', [db.tracks, db.topics, db.reviews, db.settings], async () => {
    if (!(await db.tracks.get(input.trackId))) throw new InvalidTopicError('That track no longer exists.');
    await db.topics.add(topic);
    await db.reviews.bulkAdd(reviews);
    const settings = await db.settings.get('settings');
    await db.settings.put({ ...DEFAULT_SETTINGS, ...settings, lastTrackId: input.trackId });
  });

  return { topic, reviews };
}
