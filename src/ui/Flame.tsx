import type { CSSProperties } from 'react';

/**
 * unlit: nothing scheduled yet. waiting: a review is due or coming, flickers softly.
 * lit: reviewed. steady: locked in.
 */
export type FlameState = 'unlit' | 'waiting' | 'lit' | 'steady';

interface FlameProps {
  state?: FlameState;
  /** Width in px; height follows. */
  size?: number;
  /** 0 to 1 brightness, used by the focus timer as time runs out. */
  level?: number;
  /** Accessible name. Omit when the flame is decoration beside text that says the same thing. */
  label?: string;
}

export function Flame({ state = 'unlit', size = 28, level = 1, label }: FlameProps) {
  const clamped = Math.min(1, Math.max(0, level));
  const style = { '--flame-size': `${size}px`, '--flame-level': clamped } as CSSProperties;
  return (
    <span
      className="ln-flame"
      data-state={state}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="ln-flame__glow" />
      <svg viewBox="0 0 40 56" focusable="false" aria-hidden="true">
        <path
          className="ln-flame__body"
          d="M20 3C21 13 34 21 34 36C34 46 27.5 53 20 53C12.5 53 6 46 6 36C6 28 11 23 13.5 16C15 20 17 21.5 18 21C19.5 16 18.5 9 20 3Z"
        />
        <path
          className="ln-flame__core"
          d="M20 31C22 36 26 38.500 26 43C26 47 23.300 50 20 50C16.700 50 14 47 14 43C14 38.500 18 36 20 31Z"
        />
      </svg>
    </span>
  );
}
