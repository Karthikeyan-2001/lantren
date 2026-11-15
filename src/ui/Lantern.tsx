import type { CSSProperties } from 'react';

import { Flame, type FlameState } from './Flame';

interface LanternProps {
  day4: FlameState;
  day7: FlameState;
  /** Track colour, shown as a small cap. */
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

/** One topic as a small lantern window holding its day 4 and day 7 flames. */
export function Lantern({ day4, day7, colour, compact }: LanternProps) {
  const locked = day4 === 'steady' && day7 === 'steady';
  return (
    <span
      className={compact ? 'ln-lantern ln-lantern--compact' : 'ln-lantern'}
      data-locked={locked}
      style={{ '--lantern-colour': colour } as CSSProperties}
      role="img"
      aria-label={locked ? 'locked in' : `day 4 ${WORDS[day4]}, day 7 ${WORDS[day7]}`}
    >
      <span className="ln-lantern__flames">
        <Flame state={day4} size={compact ? 16 : 22} />
        <Flame state={day7} size={compact ? 16 : 22} />
      </span>
      <span className="ln-lantern__labels" aria-hidden="true">
        <span>d4</span>
        <span>d7</span>
      </span>
    </span>
  );
}
