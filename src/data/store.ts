import { create } from 'zustand';

import { db as defaultDb, type LanternDB } from './db';
import { loadAll, saveTopic } from './repo';
import { DEFAULT_SETTINGS } from './seed';
import type { Review, Settings, Topic, TopicInput, Track } from './types';

export interface LastCapture {
  topicId: string;
  title: string;
  dueDates: Review['dueOn'][];
}

interface LanternState {
  status: 'loading' | 'ready' | 'error';
  tracks: Track[];
  topics: Topic[];
  reviews: Review[];
  settings: Settings;
  /** Shown once on Today after a capture. Memory only. */
  lastCapture: LastCapture | null;
  load: () => Promise<void>;
  capture: (input: TopicInput) => Promise<Topic>;
  dismissLastCapture: () => void;
}

/** The app's in-memory view of the database. Writes go to Dexie first, then here. */
export function createLanternStore(db: LanternDB) {
  return create<LanternState>()((set) => ({
    status: 'loading',
    tracks: [],
    topics: [],
    reviews: [],
    settings: DEFAULT_SETTINGS,
    lastCapture: null,

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
        lastCapture: { topicId: topic.id, title: topic.title, dueDates: reviews.map((r) => r.dueOn) },
      }));
      return topic;
    },

    dismissLastCapture: () => set({ lastCapture: null }),
  }));
}

export const useLantern = createLanternStore(defaultDb);
