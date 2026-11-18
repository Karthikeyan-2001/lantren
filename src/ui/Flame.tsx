import { useId, type CSSProperties } from 'react';

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

/**
 * From this width up a flame is "live": its outline licks (the path itself morphs), its inner
 * tongue and core breathe at their own pace and the odd spark rises. Smaller flames, the ones
 * in list rows, only sway and breathe, so a long list stays calm and cheap to draw.
 */
const LIVE_FROM = 40;

/** The outline. Its two morph shapes live in ui.css (`ln-lick`) and share these commands. */
const BODY =
  'M20 3C21 13 34 21 34 36C34 46 27.5 53 20 53C12.5 53 6 46 6 36C6 28 11 23 13.5 16C15 20 17 21.5 18 21C19.5 16 18.5 9 20 3Z';
const TONGUE =
  'M20 15C21 22 29 27 29 37.5C29 45 25 50 20 50C15 50 11 45 11 37.5C11 31.5 14.5 28 16.5 23.5C17.5 26 19 27 19.5 26.5C20.5 23 19.5 19 20 15Z';
const CORE = 'M20 31C22 36 26 38.5 26 43C26 47 23.3 50 20 50C16.7 50 14 47 14 43C14 38.5 18 36 20 31Z';

export function Flame({ state = 'unlit', size = 28, level = 1, label }: FlameProps) {
  const id = useId();
  const clamped = Math.min(1, Math.max(0, level));
  const live = size >= LIVE_FROM;
  const style = { '--flame-size': `${size}px`, '--flame-level': clamped } as CSSProperties;
  const fire = `${id}-fire`;
  const heart = `${id}-heart`;
  return (
    <span
      className="ln-flame"
      data-state={state}
      data-live={live || undefined}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="ln-flame__glow" />
      <svg viewBox="0 0 40 56" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id={fire} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" className="ln-flame__stop-deep" />
            <stop offset="0.55" className="ln-flame__stop-accent" />
            <stop offset="1" className="ln-flame__stop-tip" />
          </linearGradient>
          <radialGradient id={heart} cx="0.5" cy="0.75" r="0.6">
            <stop offset="0" className="ln-flame__stop-core" />
            <stop offset="1" className="ln-flame__stop-mid" />
          </radialGradient>
        </defs>
        <path className="ln-flame__body" d={BODY} />
        <path className="ln-flame__fire" d={BODY} fill={`url(#${fire})`} />
        <path className="ln-flame__tongue" d={TONGUE} fill={`url(#${heart})`} />
        <path className="ln-flame__core" d={CORE} />
        {live && (
          <g className="ln-flame__sparks">
            <circle cx="16" cy="18" r="0.9" />
            <circle cx="23.5" cy="14" r="0.7" />
          </g>
        )}
      </svg>
    </span>
  );
}
