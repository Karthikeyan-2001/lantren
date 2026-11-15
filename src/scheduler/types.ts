import type { LocalDate } from './dates';

export type Recall = 'forgot' | 'fuzzy' | 'solid';
export type TopicStatus = 'active' | 'leaky' | 'locked' | 'archived';

/** 4, 7, 14 or 30 with the default config, or 'extra' for a review added after a Forgot. */
export type DayMark = number | 'extra';

export interface Review {
  id: string;
  topicId: string;
  dayMark: DayMark;
  dueOn: LocalDate;
  /** ISO instant the review was completed. */
  doneAt?: string;
  recall?: Recall;
  snoozedCount: number;
  /** Earlier due dates, oldest first, kept each time the review is snoozed. */
  dueHistory: LocalDate[];
}

/** The part of a topic the scheduler needs. */
export interface TopicSchedule {
  id: string;
  studiedOn: LocalDate;
  status: TopicStatus;
}

export interface ScheduleOptions {
  /** Makes ids for new reviews. Injected so the scheduler stays pure and testable. */
  newId: () => string;
  /** IANA zone used to decide "today". Leave out to use the device zone. */
  timeZone?: string;
  /** The "graduation reviews" setting: add day 14 and day 30 when a topic locks in. */
  graduationReviews?: boolean;
}

export interface CompletionResult {
  /** Every review for the topic, with the completed one updated and any new ones appended. */
  reviews: Review[];
  status: TopicStatus;
  /** Reviews created by this completion (an extra, or graduation reviews). */
  added: Review[];
  /** True only when this completion is what locked the topic in. */
  justLockedIn: boolean;
}

export interface TodayGroups {
  dueToday: Review[];
  /** Waiting for you. Oldest first. */
  overdue: Review[];
  /** Due in the next seven days, soonest first. */
  comingUp: Review[];
}
