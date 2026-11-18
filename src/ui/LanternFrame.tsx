import { useId } from 'react';

/**
 * The carriage lantern drawing every lantern in the app is built on: hook and ring, a domed
 * roof with a finial, a band (in `--lantern-colour`), a glass chamber between two bronze
 * pillars, and a footed base. Flames are laid over the glass by the caller, as real `Flame`s.
 *
 * The glass is at x 22 to 78 and y 36 to 105 of the 100 x 126 drawing; callers position their
 * flames with `.ln-frame-flames`. How much light is on the glass comes from `--frame-light`
 * (0 to 1) and its colour from `--frame-light-colour`, both set by the caller's CSS.
 */
export function LanternFrame({ mullion = true }: { mullion?: boolean }) {
  const id = useId();
  const metal = `${id}-metal`;
  const roof = `${id}-roof`;
  const glow = `${id}-glow`;
  return (
    <svg className="ln-frame" viewBox="0 0 100 126" focusable="false" aria-hidden="true">
      <defs>
        {/* a turned-metal look: dark at the edges, a soft highlight a third of the way in */}
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="ln-frame__metal-lo" />
          <stop offset="0.35" className="ln-frame__metal-hi" />
          <stop offset="1" className="ln-frame__metal-lo" />
        </linearGradient>
        <linearGradient id={roof} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ln-frame__metal-hi" />
          <stop offset="1" className="ln-frame__metal-lo" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.82" r="0.75">
          <stop offset="0" className="ln-frame__glow-in" />
          <stop offset="1" className="ln-frame__glow-out" />
        </radialGradient>
      </defs>

      {/* hook and ring */}
      <path className="ln-frame__wire" d="M50 0V5.5" />
      <circle className="ln-frame__wire" cx="50" cy="9.5" r="4" />

      {/* roof, finial and the band */}
      <path d="M23 31C27 21 39 15.5 50 15C61 15.5 73 21 77 31Z" fill={`url(#${roof})`} />
      <circle cx="50" cy="15" r="2.6" fill={`url(#${roof})`} />
      <rect x="15" y="29.5" width="70" height="6.5" rx="3.25" fill={`url(#${metal})`} />
      <rect className="ln-frame__band" x="29" y="31" width="42" height="3.5" rx="1.75" />

      {/* the glass chamber and the light on it */}
      <rect className="ln-frame__glass" x="22" y="36" width="56" height="69" rx="3" />
      <rect className="ln-frame__light" x="22" y="36" width="56" height="69" rx="3" fill={`url(#${glow})`} />
      <rect className="ln-frame__shine" x="27.5" y="41" width="3" height="50" rx="1.5" />
      {mullion && <path className="ln-frame__mullion" d="M50 39V104" />}
      <rect x="22" y="36" width="56" height="2.5" fill={`url(#${metal})`} opacity="0.8" />

      {/* pillars */}
      <rect x="18.5" y="35" width="5.5" height="71" rx="2.2" fill={`url(#${metal})`} />
      <rect x="76" y="35" width="5.5" height="71" rx="2.2" fill={`url(#${metal})`} />

      {/* base and foot */}
      <rect x="15" y="104" width="70" height="6.5" rx="3.25" fill={`url(#${metal})`} />
      <path d="M29 110.5H71L65.5 119H34.5Z" fill={`url(#${roof})`} />
      <rect x="31" y="118.5" width="38" height="3.5" rx="1.75" fill={`url(#${metal})`} />
    </svg>
  );
}
