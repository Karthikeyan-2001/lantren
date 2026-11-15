/**
 * The one place the revision rhythm is defined. Change the numbers here and the
 * whole app follows; nothing else hard-codes day 4 or day 7.
 */
export const SCHEDULE = {
  /** Days after the study day (day 1) for the core reviews: day 4 and day 7. */
  REVIEW_OFFSETS: [3, 6],
  /** Optional reviews after a topic is locked in: day 14 and day 30. */
  GRADUATION_OFFSETS: [13, 29],
  /** A forgotten review comes back this many days after it was reviewed. */
  FORGOT_RETRY_DAYS: 1,
  SNOOZE_DAYS: 1,
  /** How far ahead "coming up" looks. */
  COMING_UP_DAYS: 7,
} as const;

/** The study day is day 1, so a review three days later is "day 4". */
export const dayMarkForOffset = (offset: number): number => offset + 1;
export const offsetForDayMark = (dayMark: number): number => dayMark - 1;

export const CORE_DAY_MARKS: readonly number[] = SCHEDULE.REVIEW_OFFSETS.map(dayMarkForOffset);
export const GRADUATION_DAY_MARKS: readonly number[] = SCHEDULE.GRADUATION_OFFSETS.map(dayMarkForOffset);
export const FINAL_CORE_DAY_MARK: number = Math.max(...CORE_DAY_MARKS);
