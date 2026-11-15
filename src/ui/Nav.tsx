import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const icon = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

const DESTINATIONS = [
  // an arch window
  { to: '/today', label: 'Today', icon: icon(<path d="M6 21V11a6 6 0 0 1 12 0v10M4 21h16" />) },
  // a flame
  {
    to: '/focus',
    label: 'Focus',
    icon: icon(
      <path d="M12 3c.6 4.500 6 7.500 6 12.500A6 6 0 0 1 6 15.500c0-3 1.800-4.800 2.800-7.300.8 1.600 1.700 2.200 2.200 2 .7-2.200.4-4.700 1-7.200Z" />,
    ),
  },
  // a shelf of lanterns
  {
    to: '/library',
    label: 'Library',
    icon: icon(<path d="M4 20V10a3 3 0 0 1 6 0v10M14 20v-7a3 3 0 0 1 6 0v7M3 20h18" />),
  },
] as const;

/** Which destination a screen sits under: Progress is reached from Today; Tracks and Settings from Library. */
const SUBPAGES: Record<string, readonly string[]> = {
  '/today': ['/progress'],
  '/library': ['/tracks', '/settings'],
};

const belongsTo = (destination: string, pathname: string): boolean =>
  pathname.startsWith(destination) || (SUBPAGES[destination] ?? []).some((p) => pathname.startsWith(p));

/**
 * Three destinations, plus the floating capture lantern. `hidden` takes all of it away,
 * for the one screen that is meant to be the only thing on the phone: a running focus session.
 */
export function Nav({ hidden = false }: { hidden?: boolean }) {
  const { pathname } = useLocation();
  if (hidden) return null;
  return (
    <>
      <nav className="ln-nav" aria-label="Main">
        {DESTINATIONS.map((d) => (
          <Link
            key={d.to}
            to={d.to}
            replace
            className="ln-nav__link"
            aria-current={belongsTo(d.to, pathname) ? 'page' : undefined}
          >
            {d.icon}
            {d.label}
          </Link>
        ))}
      </nav>
      {!pathname.startsWith('/capture') && !pathname.startsWith('/review') && (
        <Link to="/capture" className="ln-fab" aria-label="Capture what you studied">
          {icon(<path d="M12 5v14M5 12h14" strokeWidth="2" />)}
        </Link>
      )}
    </>
  );
}
