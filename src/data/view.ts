/** Small pure helpers that turn stored data into what the screens show. */
import { CORE_DAY_MARKS, GRADUATION_DAY_MARKS, daysBetween, type LocalDate, type Recall } from '../scheduler';
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

/** "today", "tomorrow", or "on Thu 19 Nov": for sentences about what comes next. */
export function whenWords(date: LocalDate, today: LocalDate): string {
  const ahead = daysBetween(today, date);
  if (ahead === 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return `on ${shortDate(date)}`;
}

/**
 * The next review to offer after one is finished: due today or waiting, oldest first,
 * never one from an archived topic.
 */
export function nextWaiting(
  reviews: readonly Review[],
  topics: readonly Topic[],
  today: LocalDate,
  excludeId?: string,
): Review | undefined {
  const live = new Set(topics.filter((t) => t.status !== 'archived').map((t) => t.id));
  return reviews
    .filter((r) => r.id !== excludeId && !r.doneAt && r.dueOn <= today && live.has(r.topicId))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
}

/** The topic's next undone review, soonest first. */
export function nextForTopic(reviews: readonly Review[], topicId: string): Review | undefined {
  return reviews.filter((r) => r.topicId === topicId && !r.doneAt).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
}

export interface OutcomeInput {
  recall: Recall;
  /** The review that was just rated. */
  dayMark: Review['dayMark'];
  justLockedIn: boolean;
  /** Reviews the rating added (an extra, or graduation reviews). */
  added: readonly Review[];
  /** The topic's next undone review after the rating, if any. */
  next: Review | undefined;
}

/** What the review screen says once a rating is saved. Kind, short, never a score. */
export function outcomeCopy(o: OutcomeInput, today: LocalDate): { title: string; body: string } {
  if (o.justLockedIn) {
    const [first, second] = o.added;
    return {
      title: 'Locked in',
      body:
        first && second
          ? `This one is yours now. It will drop by ${whenWords(first.dueOn, today)} and ${whenWords(second.dueOn, today)}, just to say hello.`
          : 'This one is yours now. It will not ask for you again.',
    };
  }
  if (o.recall === 'forgot') {
    const extra = o.added[0];
    return {
      title: 'A little leaky',
      body: extra
        ? `That happens. Let us look again ${whenWords(extra.dueOn, today)}; a second look is how it sticks.`
        : 'That happens. It will keep its place, and you can come back to it soon.',
    };
  }
  const next = o.next;
  const comesBack = next ? `It comes back ${whenWords(next.dueOn, today)}, ${dayMarkLabel(next)}.` : undefined;
  if (typeof o.dayMark === 'number' && GRADUATION_DAY_MARKS.includes(o.dayMark)) {
    return {
      title: 'Still glowing',
      body: next ? `Good to see it again. ${comesBack}` : 'That was its last visit. It is yours.',
    };
  }
  if (o.recall === 'fuzzy') {
    return {
      title: 'Lit, a little hazy',
      body: comesBack ?? 'Nothing more is set for it. Capture it again whenever you want another round.',
    };
  }
  return { title: 'Lit', body: comesBack ?? 'Nicely done.' };
}
