import type { LocalDate, TopicStatus } from '../scheduler';

export type { Review } from '../scheduler';

/** Names of the track colour tokens in tokens.css (`--track-<name>`). */
export const TRACK_COLOURS = ['ember', 'moss', 'dusk', 'wheat', 'clay', 'lichen'] as const;
export type TrackColour = (typeof TRACK_COLOURS)[number];

export const TOPIC_KINDS = ['concept', 'dsa-problem', 'build', 'reading'] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

export interface Track {
  id: string;
  name: string;
  colour: TrackColour;
  /** Weekly focus target in minutes (used from P6). */
  weeklyTargetMinutes: number;
  /** Kind a new topic starts with when this track is picked. */
  defaultKind: TopicKind;
  order: number;
  archived: boolean;
  createdAt: string;
}

/** Extra fields for a `dsa-problem` topic. */
export interface DsaDetails {
  problemUrl?: string;
  pattern?: string;
  minutesTaken?: number;
  solvedWithoutHints?: boolean;
}

export interface Topic {
  id: string;
  title: string;
  trackId: string;
  kind: TopicKind;
  notes: string;
  /** 1 shaky to 5 could teach it. */
  confidence: 1 | 2 | 3 | 4 | 5;
  sourceUrl?: string;
  dsa?: DsaDetails;
  /** Day 1: the local calendar day it was studied. */
  studiedOn: LocalDate;
  status: TopicStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  plannedMinutes: number;
  focusedMinutes: number;
  topicId?: string;
  trackId?: string;
  interruptions: number;
  parkingLot: string[];
}

export interface Settings {
  id: 'settings';
  /** Local time for review reminders, "HH:MM" (P4). */
  reminderTime: string;
  graduationReviews: boolean;
  dailyDigest: boolean;
  quietHours: { start: string; end: string } | null;
  /** Remembered so Capture is one tap shorter next time. */
  lastTrackId: string | null;
}

/** What Capture hands to the repository. */
export interface TopicInput {
  title: string;
  trackId: string;
  kind: TopicKind;
  notes: string;
  confidence: Topic['confidence'];
  sourceUrl?: string;
  dsa?: DsaDetails;
  studiedOn: LocalDate;
}
