/**
 * The backup file: everything Lantern keeps, as one JSON document. `buildBackup` writes it
 * and `parseBackup` reads one back, checking every record so a damaged or foreign file is
 * refused with a kind reason instead of half-restored. Pure: no storage, no files.
 */
import { SLEEP_FADE_MINUTES, SOUND_KINDS, type SleepFade, type SoundChoice } from '../focus/config';
import { isValidLength } from '../focus/session';
import { isLocalDate, toLocalDate, type DayMark, type Recall } from '../scheduler';

import type { Snapshot } from './repo';
import { DEFAULT_SETTINGS } from './seed';
import {
  TOPIC_KINDS,
  TRACK_COLOURS,
  type DsaDetails,
  type FocusSession,
  type Review,
  type Settings,
  type Topic,
  type Track,
} from './types';

export const BACKUP_VERSION = 1;
/** A backup larger than this is not one of ours; refuse before parsing. */
export const MAX_BACKUP_CHARS = 25_000_000;

export interface Backup extends Snapshot {
  app: 'lantern';
  version: typeof BACKUP_VERSION;
  /** ISO instant the backup was made. */
  exportedAt: string;
}

export function buildBackup(snapshot: Snapshot, now: Date): Backup {
  return {
    app: 'lantern',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    tracks: snapshot.tracks,
    topics: snapshot.topics,
    reviews: snapshot.reviews,
    focusSessions: snapshot.focusSessions,
    settings: snapshot.settings,
  };
}

export const serializeBackup = (backup: Backup): string => JSON.stringify(backup, null, 1);

/** "lantern-backup-2026-11-15.json", dated by the local day. */
export const backupFileName = (now: Date): string => `lantern-backup-${toLocalDate(now)}.json`;

export type ParsedBackup =
  | { ok: true; backup: Backup }
  | {
      ok: false;
      /** What to tell the person, in a sentence. */
      reason: string;
    };

export interface BackupCounts {
  tracks: number;
  topics: number;
  reviews: number;
  focusSessions: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 topics, 31 reviews and 4 focus sessions": what a backup holds, for the person to check. */
export function describeCounts(c: BackupCounts): string {
  return `${plural(c.topics, 'topic', 'topics')}, ${plural(c.reviews, 'review', 'reviews')} and ${plural(c.focusSessions, 'focus session', 'focus sessions')}`;
}

export const countBackup = (b: Pick<Backup, keyof BackupCounts>): BackupCounts => ({
  tracks: b.tracks.length,
  topics: b.topics.length,
  reviews: b.reviews.length,
  focusSessions: b.focusSessions.length,
});

/* ---------- Reading one record ---------- */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;
const isInstant = (v: unknown): v is string => isStr(v) && !Number.isNaN(new Date(v).getTime());
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.some((x) => x === v);
/** An optional field: missing or null is fine, anything else must pass `ok`. */
const optional = <T>(v: unknown, ok: (x: unknown) => x is T): v is T | undefined | null =>
  v === undefined || v === null || ok(v);
const orUndefined = <T>(v: T | null | undefined): T | undefined => v ?? undefined;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const RECALLS = ['forgot', 'fuzzy', 'solid'] as const satisfies readonly Recall[];
const STATUSES = ['active', 'leaky', 'locked', 'archived'] as const satisfies readonly Topic['status'][];

function readTrack(v: unknown): Track | null {
  if (!isObj(v)) return null;
  const { id, name, colour, weeklyTargetMinutes, defaultKind, order, archived, createdAt } = v;
  if (
    !isStr(id) ||
    !id ||
    !isStr(name) ||
    !name.trim() ||
    !isOneOf(TRACK_COLOURS, colour) ||
    !isCount(weeklyTargetMinutes) ||
    !isOneOf(TOPIC_KINDS, defaultKind) ||
    !isNum(order) ||
    typeof archived !== 'boolean' ||
    !isInstant(createdAt)
  ) {
    return null;
  }
  return { id, name, colour, weeklyTargetMinutes, defaultKind, order, archived, createdAt };
}

function readDsa(v: unknown): DsaDetails | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (!isObj(v)) return null;
  const { problemUrl, pattern, minutesTaken, solvedWithoutHints } = v;
  if (
    !optional(problemUrl, isStr) ||
    !optional(pattern, isStr) ||
    !optional(minutesTaken, isNum) ||
    !optional(solvedWithoutHints, (x): x is boolean => typeof x === 'boolean')
  ) {
    return null;
  }
  return {
    problemUrl: orUndefined(problemUrl),
    pattern: orUndefined(pattern),
    minutesTaken: orUndefined(minutesTaken),
    solvedWithoutHints: orUndefined(solvedWithoutHints),
  };
}

function readTopic(v: unknown): Topic | null {
  if (!isObj(v)) return null;
  const { id, title, trackId, kind, notes, confidence, sourceUrl, studiedOn, status, createdAt, updatedAt } = v;
  const dsa = readDsa(v.dsa);
  if (
    !isStr(id) ||
    !id ||
    !isStr(title) ||
    !title.trim() ||
    !isStr(trackId) ||
    !isOneOf(TOPIC_KINDS, kind) ||
    !isStr(notes) ||
    !(confidence === 1 || confidence === 2 || confidence === 3 || confidence === 4 || confidence === 5) ||
    !optional(sourceUrl, isStr) ||
    dsa === null ||
    !isLocalDate(studiedOn) ||
    !isOneOf(STATUSES, status) ||
    !isInstant(createdAt) ||
    !isInstant(updatedAt)
  ) {
    return null;
  }
  return {
    id,
    title,
    trackId,
    kind,
    notes,
    confidence,
    sourceUrl: orUndefined(sourceUrl),
    dsa,
    studiedOn,
    status,
    createdAt,
    updatedAt,
  };
}

function readReview(v: unknown): Review | null {
  if (!isObj(v)) return null;
  const { id, topicId, dayMark, dueOn, doneAt, recall, snoozedCount, dueHistory } = v;
  const mark: DayMark | null = dayMark === 'extra' ? 'extra' : isCount(dayMark) && dayMark >= 1 ? dayMark : null;
  if (
    !isStr(id) ||
    !id ||
    !isStr(topicId) ||
    mark === null ||
    !isLocalDate(dueOn) ||
    !optional(doneAt, isInstant) ||
    !optional(recall, (x): x is Recall => isOneOf(RECALLS, x)) ||
    !isCount(snoozedCount) ||
    !Array.isArray(dueHistory) ||
    !dueHistory.every(isLocalDate)
  ) {
    return null;
  }
  return {
    id,
    topicId,
    dayMark: mark,
    dueOn,
    doneAt: orUndefined(doneAt),
    recall: orUndefined(recall),
    snoozedCount,
    dueHistory,
  };
}

function readSession(v: unknown): FocusSession | null {
  if (!isObj(v)) return null;
  const { id, startedAt, endedAt, plannedMinutes, focusedMinutes, topicId, trackId, interruptions, parkingLot } = v;
  if (
    !isStr(id) ||
    !id ||
    !isInstant(startedAt) ||
    !optional(endedAt, isInstant) ||
    !isCount(plannedMinutes) ||
    !isCount(focusedMinutes) ||
    !optional(topicId, isStr) ||
    !optional(trackId, isStr) ||
    !isCount(interruptions) ||
    !Array.isArray(parkingLot) ||
    !parkingLot.every(isStr)
  ) {
    return null;
  }
  return {
    id,
    startedAt,
    endedAt: orUndefined(endedAt),
    plannedMinutes,
    focusedMinutes,
    topicId: orUndefined(topicId),
    trackId: orUndefined(trackId),
    interruptions,
    parkingLot,
  };
}

/**
 * Settings are read field by field: anything missing or odd falls back to its default, so a
 * backup from an older version, or with one bad field, still restores.
 */
function readSettings(v: unknown, trackIds: ReadonlySet<string>): Settings {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_SETTINGS;
  const flag = (key: 'reminders' | 'reminderOfferSeen' | 'graduationReviews' | 'dailyDigest' | 'focusChime') =>
    typeof o[key] === 'boolean' ? (o[key] as boolean) : d[key];
  const clock = (x: unknown, fallback: string) => (isStr(x) && CLOCK.test(x) ? x : fallback);
  const trackRef = (x: unknown) => (isStr(x) && trackIds.has(x) ? x : null);

  let quietHours = d.quietHours;
  if (o.quietHours === null) quietHours = null;
  else if (isObj(o.quietHours) && isStr(o.quietHours.start) && isStr(o.quietHours.end)) {
    if (CLOCK.test(o.quietHours.start) && CLOCK.test(o.quietHours.end)) {
      quietHours = { start: o.quietHours.start, end: o.quietHours.end };
    }
  }
  const sound: SoundChoice = isOneOf(['off', ...SOUND_KINDS] as const, o.focusSound) ? o.focusSound : d.focusSound;
  const fade: SleepFade = SLEEP_FADE_MINUTES.find((m) => m === o.focusSleepFade) ?? d.focusSleepFade;

  return {
    id: 'settings',
    reminders: flag('reminders'),
    reminderOfferSeen: flag('reminderOfferSeen'),
    reminderTime: clock(o.reminderTime, d.reminderTime),
    graduationReviews: flag('graduationReviews'),
    dailyDigest: flag('dailyDigest'),
    quietHours,
    lastTrackId: trackRef(o.lastTrackId),
    focusMinutes: isNum(o.focusMinutes) && isValidLength(o.focusMinutes) ? o.focusMinutes : d.focusMinutes,
    focusTrackId: trackRef(o.focusTrackId),
    focusSound: sound,
    focusVolume: isNum(o.focusVolume) && o.focusVolume >= 0 && o.focusVolume <= 1 ? o.focusVolume : d.focusVolume,
    focusSleepFade: fade,
    focusChime: flag('focusChime'),
  };
}

/* ---------- Reading the whole file ---------- */

const refuse = (reason: string): ParsedBackup => ({ ok: false, reason });
const NOT_LANTERN = 'This does not look like a Lantern backup.';

function readAll<T>(
  list: unknown,
  read: (v: unknown) => T | null,
  noun: string,
): { ok: true; items: T[] } | { ok: false; reason: string } {
  if (!Array.isArray(list)) return { ok: false, reason: `${NOT_LANTERN} The ${noun} list is missing.` };
  const items: T[] = [];
  for (const [index, entry] of list.entries()) {
    const item = read(entry);
    if (item === null)
      return { ok: false, reason: `This backup looks damaged: ${noun} ${index + 1} could not be read.` };
    items.push(item);
  }
  return { ok: true, items };
}

const hasDuplicates = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_CHARS) return refuse('That file is much larger than any Lantern backup.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse(NOT_LANTERN);
  }
  if (!isObj(raw) || raw.app !== 'lantern' || !isCount(raw.version)) return refuse(NOT_LANTERN);
  if (raw.version > BACKUP_VERSION) {
    return refuse('This backup was made by a newer version of Lantern. Update the app, then try again.');
  }
  if (raw.version !== BACKUP_VERSION) return refuse(NOT_LANTERN);

  const tracks = readAll(raw.tracks, readTrack, 'track');
  if (!tracks.ok) return refuse(tracks.reason);
  const topics = readAll(raw.topics, readTopic, 'topic');
  if (!topics.ok) return refuse(topics.reason);
  const reviews = readAll(raw.reviews, readReview, 'review');
  if (!reviews.ok) return refuse(reviews.reason);
  // Focus sessions are an addition to the format's first release; a file without any is fine.
  const sessions = readAll(raw.focusSessions ?? [], readSession, 'focus session');
  if (!sessions.ok) return refuse(sessions.reason);

  if (tracks.items.length === 0) return refuse('This backup has no tracks in it, so there is nothing to restore.');
  for (const [noun, items] of [
    ['track', tracks.items],
    ['topic', topics.items],
    ['review', reviews.items],
    ['focus session', sessions.items],
  ] as const) {
    if (hasDuplicates(items.map((i) => i.id))) {
      return refuse(`This backup looks damaged: the same ${noun} appears twice.`);
    }
  }

  const trackIds = new Set(tracks.items.map((t) => t.id));
  const topicIds = new Set(topics.items.map((t) => t.id));
  if (topics.items.some((t) => !trackIds.has(t.trackId))) {
    return refuse('This backup looks damaged: a topic belongs to a track that is not in the file.');
  }
  if (reviews.items.some((r) => !topicIds.has(r.topicId))) {
    return refuse('This backup looks damaged: a review belongs to a topic that is not in the file.');
  }

  // A session may outlive what it was filed under; it keeps its minutes and loses the link.
  const focusSessions = sessions.items.map((s) => ({
    ...s,
    trackId: s.trackId && trackIds.has(s.trackId) ? s.trackId : undefined,
    topicId: s.topicId && topicIds.has(s.topicId) ? s.topicId : undefined,
  }));

  return {
    ok: true,
    backup: {
      app: 'lantern',
      version: BACKUP_VERSION,
      exportedAt: isInstant(raw.exportedAt) ? raw.exportedAt : new Date(0).toISOString(),
      tracks: tracks.items,
      topics: topics.items,
      reviews: reviews.items,
      focusSessions,
      settings: readSettings(raw.settings, trackIds),
    },
  };
}
