/** What the progress screens say. Warm and plain; a number is stated, never judged. */
import type { Completion, Streak, WeekFocus } from './stats';

/** "45 min", "2 h", "2 h 30 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Hours with at most one decimal, for the middle of a ring: "0", "2.5", "10". */
export const hoursText = (minutes: number): string => String(Math.round(Math.max(0, minutes) / 6) / 10);

/** Hours as typed ("2", "1.5") to whole minutes; null when it is not a target between 0 and 40 hours. */
export function hoursToMinutes(text: string): number | null {
  if (!text.trim()) return null;
  const hours = Number(text);
  if (!Number.isFinite(hours) || hours < 0 || hours > 40) return null;
  return Math.round(hours * 60);
}

/** The streak's one sentence, which always says what is true and what is next. */
export function streakLine(streak: Streak): string {
  const rest = streak.restAvailable ? 'A rest day is still held for this week.' : 'This week’s rest day has been used.';
  if (streak.days === 0 && !streak.todayDone) {
    return 'A fresh start whenever you are ready. Studying, a review or a focus session lights it.';
  }
  if (streak.todayDone) return `Lit today. ${rest}`;
  return streak.restAvailable
    ? 'Nothing yet today, and that is fine. A rest day is held for this week.'
    : 'Something small today keeps it going. This week’s rest day has been used.';
}

export const streakUnit = (days: number): string => (days === 1 ? 'day' : 'days');

/** "2 h 30 min of 9 h this week", or just the time when no targets are set. */
export function weekLine(week: Pick<WeekFocus, 'totalMinutes' | 'totalTargetMinutes'>): string {
  if (week.totalMinutes === 0) return 'No focus yet this week. A short session starts it.';
  return week.totalTargetMinutes > 0
    ? `${formatMinutes(week.totalMinutes)} of ${formatMinutes(week.totalTargetMinutes)} this week`
    : `${formatMinutes(week.totalMinutes)} this week`;
}

/** The completion rate as a whole percentage, and what it is out of. */
export function completionWords(c: Completion): { value: string; note: string } {
  if (c.rate === null) return { value: '–', note: 'Nothing has come due in the last four weeks.' };
  const word = c.due === 1 ? 'review' : 'reviews';
  return { value: `${Math.round(c.rate * 100)}%`, note: `${c.done} of ${c.due} ${word} done in the last four weeks.` };
}

export function heatmapLabel(studiedDays: number, weeks: number): string {
  if (studiedDays === 0) return `No study days in the last ${weeks} weeks yet.`;
  return `${studiedDays} ${studiedDays === 1 ? 'study day' : 'study days'} in the last ${weeks} weeks.`;
}
