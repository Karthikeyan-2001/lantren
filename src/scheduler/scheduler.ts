/**
 * The 1-4-7 scheduler. Pure functions over plain data: no React, no Ionic, no
 * storage, no clock of its own. Callers pass in "now" and get new values back.
 */
import { CORE_DAY_MARKS, FINAL_CORE_DAY_MARK, GRADUATION_DAY_MARKS, SCHEDULE, offsetForDayMark } from './config';
import { addDays, compareDates, daysBetween, laterOf, toLocalDate, type LocalDate } from './dates';
import type {
  CompletionResult,
  DayMark,
  Recall,
  Review,
  ScheduleOptions,
  TodayGroups,
  TopicSchedule,
  TopicStatus,
} from './types';

const isDone = (review: Review): boolean => review.doneAt !== undefined;

function makeReview(topicId: string, dayMark: DayMark, dueOn: LocalDate, newId: () => string): Review {
  return { id: newId(), topicId, dayMark, dueOn, snoozedCount: 0, dueHistory: [] };
}

/** Studying on date D creates the core reviews: D+3 (day 4) and D+6 (day 7). */
export function createReviews(topic: Pick<TopicSchedule, 'id' | 'studiedOn'>, newId: () => string): Review[] {
  return CORE_DAY_MARKS.map((mark) =>
    makeReview(topic.id, mark, addDays(topic.studiedOn, offsetForDayMark(mark)), newId),
  );
}

/**
 * Records how a review went.
 *
 * - No other review's due date ever changes.
 * - Forgot adds one extra review the next day and marks the topic leaky.
 * - A topic locks in when a Solid rating leaves nothing else waiting and the final
 *   core review (day 7) is done. In the ordinary path that is "Solid on day 7".
 *   After a Forgot on day 7 it is the Solid on the extra review that follows.
 * - Locking in adds day 14 and day 30 reviews when graduation reviews are switched on.
 *
 * Completing a review that is already done, or one from an archived topic, changes nothing.
 */
export function completeReview(
  topic: TopicSchedule,
  reviews: readonly Review[],
  reviewId: string,
  recall: Recall,
  now: Date,
  options: ScheduleOptions,
): CompletionResult {
  const unchanged: CompletionResult = { reviews: [...reviews], status: topic.status, added: [], justLockedIn: false };
  const target = reviews.find((r) => r.id === reviewId);
  if (!target || target.topicId !== topic.id || isDone(target) || topic.status === 'archived') return unchanged;

  const today = toLocalDate(now, options.timeZone);
  const updated = reviews.map((r) => (r.id === reviewId ? { ...r, doneAt: now.toISOString(), recall } : r));
  const added: Review[] = [];
  let status: TopicStatus = topic.status;
  let justLockedIn = false;

  if (recall === 'forgot') {
    added.push(makeReview(topic.id, 'extra', addDays(today, SCHEDULE.FORGOT_RETRY_DAYS), options.newId));
    status = 'leaky';
  } else if (recall === 'solid' && status !== 'locked') {
    const isGraduation = (r: Review) => typeof r.dayMark === 'number' && GRADUATION_DAY_MARKS.includes(r.dayMark);
    const nothingWaiting = updated.every((r) => isDone(r) || isGraduation(r));
    const finalCoreDone = updated.some((r) => r.dayMark === FINAL_CORE_DAY_MARK && isDone(r));
    if (nothingWaiting && finalCoreDone) {
      status = 'locked';
      justLockedIn = true;
      if (options.graduationReviews && !updated.some(isGraduation)) {
        const earliest = addDays(today, 1);
        for (const mark of GRADUATION_DAY_MARKS) {
          const planned = addDays(topic.studiedOn, offsetForDayMark(mark));
          // A topic locked in late never gets a graduation review dated in the past.
          added.push(makeReview(topic.id, mark, laterOf(planned, earliest), options.newId));
        }
      }
    }
  }

  return { reviews: [...updated, ...added], status, added, justLockedIn };
}

/**
 * Snooze: moves one review a day later and remembers where it was.
 * The day is counted from today when the review is already overdue, so a snooze
 * always means "not today, tomorrow". A done review is returned unchanged.
 */
export function snoozeReview(review: Review, now: Date, timeZone?: string): Review {
  if (isDone(review)) return review;
  const from = laterOf(review.dueOn, toLocalDate(now, timeZone));
  return {
    ...review,
    dueOn: addDays(from, SCHEDULE.SNOOZE_DAYS),
    snoozedCount: review.snoozedCount + 1,
    dueHistory: [...review.dueHistory, review.dueOn],
  };
}

/**
 * Editing a topic's studiedOn recomputes only its undone, dated reviews.
 * Done reviews keep their history, and extra reviews stay where they are because
 * they hang off the day something was forgotten, not off the study day.
 */
export function rescheduleForStudiedOn(reviews: readonly Review[], studiedOn: LocalDate): Review[] {
  return reviews.map((r) =>
    isDone(r) || r.dayMark === 'extra' ? r : { ...r, dueOn: addDays(studiedOn, offsetForDayMark(r.dayMark)) },
  );
}

/** A review is waiting (overdue) when it is undone and its date has passed. It is never dropped. */
export function isOverdue(review: Review, today: LocalDate): boolean {
  return !isDone(review) && review.dueOn < today;
}

/** Splits undone reviews into Today's three groups. Later reviews are in none of them. */
export function groupForToday(reviews: readonly Review[], today: LocalDate): TodayGroups {
  const groups: TodayGroups = { dueToday: [], overdue: [], comingUp: [] };
  for (const review of reviews) {
    if (isDone(review)) continue;
    const ahead = daysBetween(today, review.dueOn);
    if (ahead === 0) groups.dueToday.push(review);
    else if (ahead < 0) groups.overdue.push(review);
    else if (ahead <= SCHEDULE.COMING_UP_DAYS) groups.comingUp.push(review);
  }
  const byDate = (a: Review, b: Review) => compareDates(a.dueOn, b.dueOn);
  groups.overdue.sort(byDate);
  groups.comingUp.sort(byDate);
  return groups;
}
