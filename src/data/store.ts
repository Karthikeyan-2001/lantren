import { create } from 'zustand';

import { toLocalDate, type Recall } from '../scheduler';

import { db as defaultDb, type LanternDB } from './db';
import {
  addTrack,
  loadAll,
  recordReview,
  replaceAll,
  saveFocusSession,
  saveTopic,
  snoozeReviewById,
  updateSettings,
  updateTrack,
  wipeAll,
  type ReviewOutcome,
  type Snapshot,
  type TrackInput,
} from './repo';
import { DEFAULT_SETTINGS } from './seed';
import type { FocusSession, Review, Settings, Topic, TopicInput, Track } from './types';
import { whenWords } from './view';

interface LanternState {
  status: 'loading' | 'ready' | 'error';
  tracks: Track[];
  topics: Topic[];
  reviews: Review[];
  /** Finished focus sessions, oldest first. */
  focusSessions: FocusSession[];
  settings: Settings;
  /** One quiet line shown on Today after a capture or a snooze. Memory only. */
  notice: string | null;
  load: () => Promise<void>;
  capture: (input: TopicInput) => Promise<Topic>;
  review: (reviewId: string, recall: Recall) => Promise<ReviewOutcome>;
  snooze: (reviewId: string) => Promise<Review>;
  logFocus: (session: FocusSession) => Promise<void>;
  addTrack: (input: TrackInput) => Promise<Track>;
  editTrack: (id: string, patch: Partial<TrackInput> & { archived?: boolean }) => Promise<Track>;
  /** Replaces everything on the device with a backup's contents. */
  restore: (data: Snapshot) => Promise<void>;
  /** Deletes everything and starts over as on first run. */
  wipe: () => Promise<void>;
  updateSettings: (patch: Partial<Omit<Settings, 'id'>>) => Promise<void>;
  dismissNotice: () => void;
}

const replaceById = <T extends { id: string }>(list: readonly T[], item: T): T[] =>
  list.map((x) => (x.id === item.id ? item : x));

/** The app's in-memory view of the database. Writes go to Dexie first, then here. */
export function createLanternStore(db: LanternDB) {
  return create<LanternState>()((set, get) => ({
    status: 'loading',
    tracks: [],
    topics: [],
    reviews: [],
    focusSessions: [],
    settings: DEFAULT_SETTINGS,
    notice: null,

    load: async () => {
      try {
        const snapshot = await loadAll(db);
        set({ ...snapshot, status: 'ready' });
      } catch (error) {
        console.warn('Lantern could not open its storage', error);
        set({ status: 'error' });
      }
    },

    capture: async (input) => {
      const { topic, reviews } = await saveTopic(db, input, new Date());
      set((s) => ({
        topics: [...s.topics, topic],
        reviews: [...s.reviews, ...reviews],
        settings: { ...s.settings, lastTrackId: topic.trackId },
        notice: `“${topic.title}” is lit. Back ${reviews.map((r) => whenWords(r.dueOn, toLocalDate(new Date()))).join(' and ')}.`,
      }));
      return topic;
    },

    review: async (reviewId, recall) => {
      const outcome = await recordReview(db, reviewId, recall, new Date());
      set((s) => ({
        topics: replaceById(s.topics, outcome.topic),
        reviews: [...replaceById(s.reviews, outcome.review), ...outcome.added],
      }));
      return outcome;
    },

    snooze: async (reviewId) => {
      const moved = await snoozeReviewById(db, reviewId, new Date());
      set((s) => {
        const title = s.topics.find((t) => t.id === moved.topicId)?.title;
        return {
          reviews: replaceById(s.reviews, moved),
          notice: title ? `“${title}” will be back ${whenWords(moved.dueOn, toLocalDate(new Date()))}.` : s.notice,
        };
      });
      return moved;
    },

    logFocus: async (session) => {
      const stored = await saveFocusSession(db, session);
      set((s) => ({ focusSessions: [...s.focusSessions.filter((f) => f.id !== stored.id), stored] }));
    },

    addTrack: async (input) => {
      const track = await addTrack(db, input, new Date());
      set((s) => ({ tracks: [...s.tracks, track] }));
      return track;
    },

    editTrack: async (id, patch) => {
      const track = await updateTrack(db, id, patch);
      set((s) => ({ tracks: replaceById(s.tracks, track) }));
      return track;
    },

    restore: async (data) => {
      await replaceAll(db, data);
      set({ ...(await loadAll(db)), status: 'ready', notice: null });
    },

    wipe: async () => {
      await wipeAll(db, new Date());
      set({ ...(await loadAll(db)), status: 'ready', notice: null });
    },

    // Optimistic, so a switch moves the moment it is tapped; put back if the write fails.
    updateSettings: async (patch) => {
      const before = get().settings;
      set({ settings: { ...before, ...patch } });
      try {
        set({ settings: await updateSettings(db, patch) });
      } catch (error) {
        set({ settings: before });
        throw error;
      }
    },

    dismissNotice: () => set({ notice: null }),
  }));
}

export const useLantern = createLanternStore(defaultDb);
