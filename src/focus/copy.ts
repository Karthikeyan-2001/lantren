/** What the focus screen says. Short and kind; a fact is stated, never scored. */
import type { SoundChoice } from './config';
import type { FinishedFocus } from './session';

export const SOUND_LABELS: Record<SoundChoice, string> = {
  off: 'Off',
  rain: 'Rain',
  brown: 'Brown noise',
  hum: 'Soft hum',
};

export const minutesWord = (n: number): string => `${n} ${n === 1 ? 'minute' : 'minutes'}`;

function awayWords(times: number): string {
  if (times <= 0) return '';
  const count = times === 1 ? 'once' : times === 2 ? 'twice' : `${times} times`;
  return ` You stepped away ${count} and came back.`;
}

/** The done card: what a session amounted to, said warmly. */
export function focusSummary(
  session: FinishedFocus,
  completed: boolean,
  trackName?: string,
): { title: string; body: string } {
  const on = trackName ? ` on ${trackName}` : '';
  const away = awayWords(session.interruptions);
  if (!completed) {
    return {
      title: `Stopped at ${minutesWord(session.focusedMinutes)}`,
      body: `That still counts${trackName ? ` toward ${trackName}` : ''}.${away}`,
    };
  }
  const amount =
    session.focusedMinutes < session.plannedMinutes
      ? `${session.focusedMinutes} of ${minutesWord(session.plannedMinutes)} focused`
      : minutesWord(session.plannedMinutes);
  return { title: 'That was good work', body: `${amount}${on}.${away}` };
}
