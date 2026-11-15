/**
 * Every read and write of the database goes through here. Scheduling decisions are
 * the scheduler's; this module only stores what it returns.
 */
import { completeReview, createReviews, isLocalDate, snoozeReview, toLocalDate, type Recall } from '../scheduler';

import type { LanternDB } from './db';
import { newId } from './ids';
import { DEFAULT_SETTINGS, starterTracks } from './seed';
import {
  TRACK_COLOURS,
  type FocusSession,
  type Review,
  type Settings,
  type Topic,
  type TopicInput,
  type Track,
  type TrackColour,
} from './types';

export interface Snapshot {
  tracks: Track[];
  topics: Topic[];
  reviews: Review[];
  focusSessions: FocusSession[];
  settings: Settings;
}

export async function loadAll(db: LanternDB): Promise<Snapshot> {
  return db.transaction('r', [db.tracks, db.topics, db.reviews, db.focusSessions, db.settings], async () => {
    const [tracks, topics, reviews, focusSessions, settings] = await Promise.all([
      db.tracks.orderBy('order').toArray(),
      db.topics.toArray(),
      db.reviews.toArray(),
      db.focusSessions.orderBy('startedAt').toArray(),
      db.settings.get('settings'),
    ]);
    return { tracks, topics, reviews, focusSessions, settings: { ...DEFAULT_SETTINGS, ...settings } };
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

/**
 * Stores a finished focus session. Saving the same session again replaces it, so a
 * retry after a failed write cannot make two.
 */
export async function saveFocusSession(db: LanternDB, session: FocusSession): Promise<FocusSession> {
  await db.focusSessions.put(session);
  return session;
}

/* ---------- Tracks ---------- */

export class InvalidTrackError extends Error {}

export interface TrackInput {
  name: string;
  colour: TrackColour;
  /** Minutes of focus aimed at each week; 0 means no target. */
  weeklyTargetMinutes: number;
}

export const TRACK_NAME_MAX = 60;
export const TRACK_TARGET_MAX_MINUTES = 40 * 60;

function checkTrackFields(patch: Partial<TrackInput>): void {
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new InvalidTrackError('A track needs a name.');
    if (name.length > TRACK_NAME_MAX) throw new InvalidTrackError(`Keep the name under ${TRACK_NAME_MAX} letters.`);
  }
  if (patch.colour !== undefined && !TRACK_COLOURS.includes(patch.colour)) {
    throw new InvalidTrackError('That colour is not one of the lantern colours.');
  }
  const target = patch.weeklyTargetMinutes;
  if (target !== undefined && !(Number.isInteger(target) && target >= 0 && target <= TRACK_TARGET_MAX_MINUTES)) {
    throw new InvalidTrackError('The weekly target should be between 0 and 40 hours.');
  }
}

/** Adds a track after the others. */
export async function addTrack(db: LanternDB, input: TrackInput, now: Date): Promise<Track> {
  checkTrackFields(input);
  return db.transaction('rw', [db.tracks], async () => {
    const last = await db.tracks.orderBy('order').last();
    const track: Track = {
      id: newId(),
      name: input.name.trim(),
      colour: input.colour,
      weeklyTargetMinutes: input.weeklyTargetMinutes,
      defaultKind: 'concept',
      order: (last?.order ?? -1) + 1,
      archived: false,
      createdAt: now.toISOString(),
    };
    await db.tracks.add(track);
    return track;
  });
}

/**
 * Changes a track's name, colour, target, or whether it is in view. Topics stay with their
 * track when it is put away. At least one track always stays in view, since Capture needs one.
 */
export async function updateTrack(
  db: LanternDB,
  id: string,
  patch: Partial<TrackInput> & { archived?: boolean },
): Promise<Track> {
  checkTrackFields(patch);
  return db.transaction('rw', [db.tracks], async () => {
    const track = await db.tracks.get(id);
    if (!track) throw new InvalidTrackError('That track is no longer here.');
    if (patch.archived === true && !track.archived) {
      const inView = (await db.tracks.toArray()).filter((t) => !t.archived && t.id !== id);
      if (inView.length === 0) throw new InvalidTrackError('Keep at least one track in view.');
    }
    const next: Track = {
      ...track,
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.colour !== undefined && { colour: patch.colour }),
      ...(patch.weeklyTargetMinutes !== undefined && { weeklyTargetMinutes: patch.weeklyTargetMinutes }),
      ...(patch.archived !== undefined && { archived: patch.archived }),
    };
    await db.tracks.put(next);
    return next;
  });
}

/* ---------- Everything at once: restore and delete ---------- */

/**
 * Replaces everything on the device with a backup's contents, in one transaction: either
 * all of it is swapped in or none of it is.
 */
export async function replaceAll(db: LanternDB, data: Snapshot): Promise<void> {
  await db.transaction('rw', [db.tracks, db.topics, db.reviews, db.focusSessions, db.settings], async () => {
    await Promise.all([db.tracks.clear(), db.topics.clear(), db.reviews.clear(), db.focusSessions.clear()]);
    await db.settings.clear();
    await db.tracks.bulkAdd(data.tracks);
    await db.topics.bulkAdd(data.topics);
    await db.reviews.bulkAdd(data.reviews);
    await db.focusSessions.bulkAdd(data.focusSessions);
    await db.settings.put({ ...data.settings, id: 'settings' });
  });
}

/** Deletes everything and starts over as on first run: the starter tracks and default settings. */
export async function wipeAll(db: LanternDB, now: Date): Promise<void> {
  await db.transaction('rw', [db.tracks, db.topics, db.reviews, db.focusSessions, db.settings], async () => {
    await Promise.all([
      db.tracks.clear(),
      db.topics.clear(),
      db.reviews.clear(),
      db.focusSessions.clear(),
      db.settings.clear(),
    ]);
    await db.tracks.bulkAdd(starterTracks(now));
    await db.settings.add(DEFAULT_SETTINGS);
  });
}
