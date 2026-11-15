import type { Settings, Track } from './types';

type Seed = Pick<Track, 'id' | 'name' | 'colour' | 'weeklyTargetMinutes' | 'defaultKind'>;

/** Six starter tracks for an engineer moving toward AI and full-stack work, about 9.5 hours a week. */
const STARTER: readonly Seed[] = [
  { id: 'track-dsa', name: 'DSA in JavaScript', colour: 'ember', weeklyTargetMinutes: 120, defaultKind: 'dsa-problem' },
  { id: 'track-ai', name: 'AI engineering', colour: 'lichen', weeklyTargetMinutes: 150, defaultKind: 'concept' },
  { id: 'track-ml', name: 'ML foundations', colour: 'dusk', weeklyTargetMinutes: 90, defaultKind: 'concept' },
  {
    id: 'track-js',
    name: 'JavaScript and TypeScript',
    colour: 'wheat',
    weeklyTargetMinutes: 60,
    defaultKind: 'concept',
  },
  { id: 'track-web', name: 'Full-stack web', colour: 'moss', weeklyTargetMinutes: 90, defaultKind: 'build' },
  { id: 'track-sd', name: 'System design', colour: 'clay', weeklyTargetMinutes: 60, defaultKind: 'concept' },
];

export function starterTracks(now: Date): Track[] {
  return STARTER.map((t, order) => ({ ...t, order, archived: false, createdAt: now.toISOString() }));
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  reminders: false,
  reminderOfferSeen: false,
  reminderTime: '19:30',
  graduationReviews: false,
  dailyDigest: false,
  quietHours: { start: '22:00', end: '07:00' },
  lastTrackId: null,
  focusMinutes: 25,
  focusTrackId: null,
  focusSound: 'off',
  focusVolume: 0.5,
  focusSleepFade: 0,
  focusChime: true,
};
