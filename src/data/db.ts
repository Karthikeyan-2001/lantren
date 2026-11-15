import Dexie, { type EntityTable } from 'dexie';

import { DEFAULT_SETTINGS, starterTracks } from './seed';
import type { FocusSession, Review, Settings, Topic, Track } from './types';

export type LanternDB = Dexie & {
  tracks: EntityTable<Track, 'id'>;
  topics: EntityTable<Topic, 'id'>;
  reviews: EntityTable<Review, 'id'>;
  focusSessions: EntityTable<FocusSession, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

/** Opens (and on first run, seeds) the on-device database. */
export function openDb(name = 'lantern'): LanternDB {
  const db = new Dexie(name) as LanternDB;
  // Only indexed fields are listed; everything else is stored as-is.
  db.version(1).stores({
    tracks: 'id, order',
    topics: 'id, trackId, studiedOn, status',
    reviews: 'id, topicId, dueOn',
    focusSessions: 'id, startedAt, topicId, trackId',
    settings: 'id',
  });
  // Runs once, when the database is first created.
  db.on('populate', async (tx) => {
    await tx.table('tracks').bulkAdd(starterTracks(new Date()));
    await tx.table('settings').add(DEFAULT_SETTINGS);
  });
  return db;
}

export const db = openDb();
