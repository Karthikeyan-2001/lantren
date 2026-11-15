import type { CSSProperties } from 'react';

import { Flame, type FlameState } from './Flame';

/**
 * ready: lit and waiting to begin. burning: a session is running and the flame follows
 * `level`. held: paused. resting: a break, the flame coming back. glow: finished, warm.
 */
export type HearthMood = 'ready' | 'burning' | 'held' | 'resting' | 'glow';

const FLAME: Record<HearthMood, FlameState> = {
  ready: 'lit',
  burning: 'lit',
  held: 'waiting',
  resting: 'waiting',
  glow: 'steady',
};

interface HearthProps {
  mood: HearthMood;
  /** 0 to 1: how much of the flame is left. Ignored when ready or glowing. */
  level?: number;
  /** Smaller, for the style guide and tight spaces. */
  compact?: boolean;
}

/**
 * The focus screen's one picture: a tall lantern window holding a single flame. The flame
 * and the light on the glass dim together as a session runs down. Decoration only; the
 * timer beside it carries the meaning for screen readers.
 */
export function Hearth({ mood, level = 1, compact }: HearthProps) {
  const shown = mood === 'ready' || mood === 'glow' ? 1 : Math.min(1, Math.max(0, level));
  return (
    <div
      className={compact ? 'ln-hearth ln-hearth--compact' : 'ln-hearth'}
      data-mood={mood}
      style={{ '--hearth-level': shown } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ln-hearth__light" />
      <span className="ln-hearth__flame">
        <Flame state={FLAME[mood]} size={compact ? 52 : 84} level={shown} />
      </span>
      <span className="ln-hearth__sill" />
    </div>
  );
}
