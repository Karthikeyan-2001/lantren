import { useId, type CSSProperties } from 'react';

import { Flame, type FlameState } from './Flame';

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
 * The frame is one SVG; the flames are real `Flame`s laid over the glass, so they keep their motion.
 */
export function Lantern({ day4, day7, colour, compact }: LanternProps) {
  const id = useId();
  const locked = day4 === 'steady' && day7 === 'steady';
  const metal = `${id}-metal`;
  const roof = `${id}-roof`;
  const glow = `${id}-glow`;
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
        <svg className="ln-lantern__frame" viewBox="0 0 100 126" focusable="false" aria-hidden="true">
          <defs>
            {/* a turned-metal look: dark at the edges, a soft highlight a third of the way in */}
            <linearGradient id={metal} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" className="ln-lantern__metal-lo" />
              <stop offset="0.35" className="ln-lantern__metal-hi" />
              <stop offset="1" className="ln-lantern__metal-lo" />
            </linearGradient>
            <linearGradient id={roof} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="ln-lantern__metal-hi" />
              <stop offset="1" className="ln-lantern__metal-lo" />
            </linearGradient>
            <radialGradient id={glow} cx="0.5" cy="0.82" r="0.75">
              <stop offset="0" className="ln-lantern__glow-in" />
              <stop offset="1" className="ln-lantern__glow-out" />
            </radialGradient>
          </defs>

          {/* hook and ring */}
          <path className="ln-lantern__wire" d="M50 0V5.5" />
          <circle className="ln-lantern__wire" cx="50" cy="9.5" r="4" />

          {/* roof, finial and the band in the track's colour */}
          <path d="M23 31C27 21 39 15.5 50 15C61 15.5 73 21 77 31Z" fill={`url(#${roof})`} />
          <circle cx="50" cy="15" r="2.6" fill={`url(#${roof})`} />
          <rect x="15" y="29.5" width="70" height="6.5" rx="3.25" fill={`url(#${metal})`} />
          <rect className="ln-lantern__band" x="29" y="31" width="42" height="3.5" rx="1.75" />

          {/* the glass chamber and the light on it */}
          <rect className="ln-lantern__glass" x="22" y="36" width="56" height="69" rx="3" />
          <rect className="ln-lantern__light" x="22" y="36" width="56" height="69" rx="3" fill={`url(#${glow})`} />
          <rect className="ln-lantern__shine" x="27.5" y="41" width="3" height="50" rx="1.5" />
          <path className="ln-lantern__mullion" d="M50 39V104" />
          <rect x="22" y="36" width="56" height="2.5" fill={`url(#${metal})`} opacity="0.8" />

          {/* pillars */}
          <rect x="18.5" y="35" width="5.5" height="71" rx="2.2" fill={`url(#${metal})`} />
          <rect x="76" y="35" width="5.5" height="71" rx="2.2" fill={`url(#${metal})`} />

          {/* base and foot */}
          <rect x="15" y="104" width="70" height="6.5" rx="3.25" fill={`url(#${metal})`} />
          <path d="M29 110.5H71L65.5 119H34.5Z" fill={`url(#${roof})`} />
          <rect x="31" y="118.5" width="38" height="3.5" rx="1.75" fill={`url(#${metal})`} />
        </svg>
        <span className="ln-lantern__flames">
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
