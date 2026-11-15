/**
 * Every read and write of the database goes through here. Scheduling decisions are
 * the scheduler's; this module only stores what it returns.
 */
import { completeReview, createReviews, isLocalDate, snoozeReview, toLocalDate, type Recall } from '../scheduler';

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

export class ReviewNotFoundError extends Error {}

export interface ReviewOutcome {
  topic: Topic;
  /** The completed review as stored. */
  review: Review;
  /** Reviews this completion added: an extra after Forgot, or graduation reviews. */
  added: Review[];
  justLockedIn: boolean;
}

/**
 * Records how a review went. The scheduler decides; this stores the completed review,
 * any review it adds and the topic's new status, all in one transaction.
 */
export async function recordReview(db: LanternDB, reviewId: string, recall: Recall, now: Date): Promise<ReviewOutcome> {
  return db.transaction('rw', [db.topics, db.reviews, db.settings], async () => {
    const target = await db.reviews.get(reviewId);
    const topic = target && (await db.topics.get(target.topicId));
    if (!target || !topic) throw new ReviewNotFoundError('That review is no longer here.');
    const settings = { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) };
    const siblings = await db.reviews.where('topicId').equals(topic.id).toArray();

    const result = completeReview(topic, siblings, reviewId, recall, now, {
      newId,
      graduationReviews: settings.graduationReviews,
    });
    const review = result.reviews.find((r) => r.id === reviewId) ?? target;
    const updatedTopic: Topic =
      result.status === topic.status ? topic : { ...topic, status: result.status, updatedAt: now.toISOString() };

    if (review !== target) await db.reviews.put(review);
    if (result.added.length > 0) await db.reviews.bulkAdd(result.added);
    if (updatedTopic !== topic) await db.topics.put(updatedTopic);
    return { topic: updatedTopic, review, added: result.added, justLockedIn: result.justLockedIn };
  });
}

/** "Not today": moves one review to tomorrow (or a day later if it is still ahead). */
export async function snoozeReviewById(db: LanternDB, reviewId: string, now: Date): Promise<Review> {
  return db.transaction('rw', [db.reviews], async () => {
    const target = await db.reviews.get(reviewId);
    if (!target) throw new ReviewNotFoundError('That review is no longer here.');
    const moved = snoozeReview(target, now);
    if (moved !== target) await db.reviews.put(moved);
    return moved;
  });
}

export async function updateSettings(db: LanternDB, patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  return db.transaction('rw', [db.settings], async () => {
    const next: Settings = { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')), ...patch, id: 'settings' };
    await db.settings.put(next);
    return next;
  });
}
