/** Every number the focus timer uses, in one place. */
export const FOCUS = {
  /** Session lengths offered as pills, in minutes. */
  PRESET_MINUTES: [25, 50, 90],
  CUSTOM_MIN_MINUTES: 5,
  CUSTOM_MAX_MINUTES: 180,
  SHORT_BREAK_MINUTES: 5,
  LONG_BREAK_MINUTES: 15,
  /** A session this long, or every Nth finished session of the day, earns the long break. */
  LONG_BREAK_FROM_MINUTES: 50,
  LONG_BREAK_EVERY: 4,
  /** Leaving the app for less than this is not an interruption (a glance, a system dialog). */
  AWAY_GRACE_MS: 10_000,
  /** An early stop with less focused time than this is not kept. */
  MIN_KEPT_MINUTES: 1,
} as const;

export const SOUND_KINDS = ['rain', 'brown', 'hum'] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];
export type SoundChoice = SoundKind | 'off';

/** Minutes after which the sound fades away; 0 keeps it for the whole session. */
export const SLEEP_FADE_MINUTES = [0, 15, 30, 60] as const;
export type SleepFade = (typeof SLEEP_FADE_MINUTES)[number];
