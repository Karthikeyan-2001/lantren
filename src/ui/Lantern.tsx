import type { CSSProperties } from 'react';

import { Flame, type FlameState } from './Flame';
import { LanternFrame } from './LanternFrame';

interface LanternProps {
  day4: FlameState;
  day7: FlameState;
  /** Track colour, carried on the band under the roof. */
  colour?: string;
  /** Smaller lantern for list rows. */
  compact?: boolean;
}

const WORDS: Record<FlameState, string> = {
  unlit: 'not set',
  waiting: 'waiting',
  lit: 'reviewed',
  steady: 'locked in',
};

const burning = (s: FlameState): boolean => s === 'lit' || s === 'steady';

/** How warm the glass is: nothing, a faint ember while waiting, half or fully lit. */
function glassGlow(day4: FlameState, day7: FlameState): 'none' | 'ember' | 'half' | 'full' {
  const lit = Number(burning(day4)) + Number(burning(day7));
  if (lit === 2) return 'full';
  if (lit === 1) return 'half';
  return day4 === 'waiting' || day7 === 'waiting' ? 'ember' : 'none';
}

/**
 * One topic as a small carriage lantern: a ring to hang it by, a domed roof with a band in the
 * track's colour, a glass chamber between two bronze pillars holding the day 4 and day 7 flames,
 * and a footed base. The glass catches the flames' light; the warmer it is, the more is lit.
 * The frame is the shared `LanternFrame`; the flames are real `Flame`s laid over its glass.
 */
export function Lantern({ day4, day7, colour, compact }: LanternProps) {
  const locked = day4 === 'steady' && day7 === 'steady';
  const flameSize = compact ? 15 : 18;
  return (
    <span
      className={compact ? 'ln-lantern ln-lantern--compact' : 'ln-lantern'}
      data-locked={locked}
      data-glow={glassGlow(day4, day7)}
      style={{ '--lantern-colour': colour } as CSSProperties}
      role="img"
      aria-label={locked ? 'locked in' : `day 4 ${WORDS[day4]}, day 7 ${WORDS[day7]}`}
    >
      <span className="ln-lantern__body">
        <LanternFrame />
        <span className="ln-frame-flames">
          <Flame state={day4} size={flameSize} />
          <Flame state={day7} size={flameSize} />
        </span>
      </span>
      <span className="ln-lantern__labels" aria-hidden="true">
        <span>d4</span>
        <span>d7</span>
      </span>
    </span>
  );
}
