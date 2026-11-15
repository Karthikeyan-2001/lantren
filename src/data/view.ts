/** Small pure helpers that turn stored data into what the screens show. */
import { CORE_DAY_MARKS, daysBetween, type LocalDate } from '../scheduler';
import type { FlameState } from '../ui/Flame';

import type { Review, Topic, TopicKind, Track } from './types';

export const KIND_LABELS: Record<TopicKind, string> = {
  concept: 'Concept',
  'dsa-problem': 'DSA problem',
  build: 'Build',
  reading: 'Reading',
};

export const trackColour = (track: Track | undefined): string | undefined =>
  track ? `var(--track-${track.colour})` : undefined;

/**
 * One core review as a flame: steady once the topic is locked in, lit when reviewed,
 * waiting (soft flicker) when due or overdue, unlit while it is still ahead.
 */
export function flameFor(review: Review | undefined, topic: Topic, today: LocalDate): FlameState {
  if (topic.status === 'locked') return 'steady';
  if (!review) return 'unlit';
  if (review.doneAt) return 'lit';
  return review.dueOn <= today ? 'waiting' : 'unlit';
}

/** The day 4 and day 7 flames for a topic's lantern. */
export function lanternFlames(topic: Topic, reviews: readonly Review[], today: LocalDate): [FlameState, FlameState] {
  const [first, second] = CORE_DAY_MARKS;
  const mine = reviews.filter((r) => r.topicId === topic.id);
  return [
    flameFor(
      mine.find((r) => r.dayMark === first),
      topic,
      today,
    ),
    flameFor(
      mine.find((r) => r.dayMark === second),
      topic,
      today,
    ),
  ];
}

export function dayMarkLabel(review: Review): string {
  return review.dayMark === 'extra' ? 'one more look' : `day ${review.dayMark}`;
}

function toCalendar(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Local noon: formatting only, never arithmetic. Arithmetic stays in the scheduler.
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

/** "Thu 19 Nov". */
export function shortDate(date: LocalDate): string {
  return toCalendar(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "today", "tomorrow", "yesterday", "Thu 19 Nov", or "3 days ago" for waiting reviews. */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  const ahead = daysBetween(today, date);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  if (ahead === -1) return 'since yesterday';
  if (ahead < 0) return `since ${shortDate(date)}`;
  return shortDate(date);
}

const WORDS = ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "One", "Two" ... "Ten", then digits. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}
