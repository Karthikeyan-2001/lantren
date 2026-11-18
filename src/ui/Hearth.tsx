import type { CSSProperties } from 'react';

import { Flame, type FlameState } from './Flame';
import { LanternFrame } from './LanternFrame';

/**
 * ready: lit and waiting to begin. burning: a session is running and the flame follows
 * `level`. held: paused. resting: a break, the flame coming back. glow: finished, warm.
 * dark: nothing lit yet.
 */
export type HearthMood = 'ready' | 'burning' | 'held' | 'resting' | 'glow' | 'dark';

const FLAME: Record<HearthMood, FlameState> = {
  ready: 'lit',
  burning: 'lit',
  held: 'waiting',
  resting: 'waiting',
  glow: 'steady',
  dark: 'unlit',
};

type HearthSize = 'full' | 'compact' | 'mini';

const FLAME_SIZE: Record<HearthSize, number> = { full: 72, compact: 40, mini: 28 };

interface HearthProps {
  mood: HearthMood;
  /** 0 to 1: how much of the flame is left. Ignored when ready or glowing. */
  level?: number;
  /** Smaller, for the Focus set-up and the style guide. */
  compact?: boolean;
  /** Smallest, for empty states and the streak. */
  mini?: boolean;
}

/**
 * One lantern holding a single flame: the Focus screen's picture, and the lamp in empty states
 * and on the streak. Flame, glass and the light spilling around the lantern dim together as a
 * session runs down; while it burns the lantern sways a little on its ring. Decoration only;
 * the words beside it carry the meaning for screen readers.
 */
export function Hearth({ mood, level = 1, compact, mini }: HearthProps) {
  const size: HearthSize = mini ? 'mini' : compact ? 'compact' : 'full';
  const shown = mood === 'ready' || mood === 'glow' ? 1 : mood === 'dark' ? 0 : Math.min(1, Math.max(0, level));
  return (
    <div
      className={`ln-hearth ln-hearth--${size}`}
      data-mood={mood}
      style={{ '--hearth-level': shown } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ln-hearth__spill" />
      <span className="ln-hearth__body">
        <LanternFrame mullion={false} />
        <span className="ln-frame-flames ln-hearth__flame">
          <Flame state={FLAME[mood]} size={FLAME_SIZE[size]} level={shown} />
        </span>
      </span>
    </div>
  );
}
