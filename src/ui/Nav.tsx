import type { CSSProperties, ReactNode } from 'react';
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
  // a lantern with a flame inside
  {
    to: '/today',
    label: 'Today',
    icon: icon(
      <path d="M12 1.8v2.2M8.6 6.8C9.2 5 10.4 4 12 4s2.8 1 3.4 2.8M7.2 6.8h9.6M8.4 6.8v10.6M15.6 6.8v10.6M7.2 17.4h9.6M9.8 17.4l.6 2.6h3.2l.6-2.6M12 9.6c1 1.3 1.7 2.1 1.7 3.2a1.7 1.7 0 0 1-3.4 0c0-1.1.7-1.9 1.7-3.2Z" />,
    ),
  },
  // a flame
  {
    to: '/focus',
    label: 'Focus',
    icon: icon(
      <path d="M12 3c.6 4.500 6 7.500 6 12.500A6 6 0 0 1 6 15.500c0-3 1.800-4.800 2.800-7.300.8 1.600 1.700 2.200 2.200 2 .7-2.200.4-4.700 1-7.200Z" />,
    ),
  },
  // two lanterns on a shelf
  {
    to: '/library',
    label: 'Library',
    icon: icon(
      <path d="M7 3.5v1.6M4.8 7.2c.4-1.3 1.2-2.1 2.2-2.1s1.8.8 2.2 2.1M4.2 7.2h5.6M5 7.2v10.3M9 7.2v10.3M17 6.5v1.6M14.8 10.2c.4-1.3 1.2-2.1 2.2-2.1s1.8.8 2.2 2.1M14.2 10.2h5.6M15 10.2v7.3M19 10.2v7.3M2.5 20.5h19M4.2 17.5h15.6" />,
    ),
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
  const active = DESTINATIONS.findIndex((d) => belongsTo(d.to, pathname));
  const capture = !pathname.startsWith('/capture') && !pathname.startsWith('/review');
  return (
    <>
      <div className="ln-dock-scrim" aria-hidden="true" />
      <nav
        className={capture ? 'ln-nav' : 'ln-nav ln-nav--solo'}
        aria-label="Main"
        style={{ '--nav-index': Math.max(active, 0) } as CSSProperties}
      >
        <span className="ln-nav__indicator" data-off={active < 0 || undefined} aria-hidden="true" />
        {DESTINATIONS.map((d, i) => (
          <Link key={d.to} to={d.to} replace className="ln-nav__link" aria-current={i === active ? 'page' : undefined}>
            {d.icon}
            {d.label}
          </Link>
        ))}
      </nav>
      {capture && (
        <Link to="/capture" className="ln-fab" aria-label="Capture what you studied">
          {icon(<path d="M12 5v14M5 12h14" strokeWidth="2" />)}
        </Link>
      )}
    </>
  );
}
