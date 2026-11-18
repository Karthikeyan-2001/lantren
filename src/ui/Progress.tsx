import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ProgressRing } from './controls';

/* ---------- Heatmap ---------- */

export interface HeatmapCell {
  /** YYYY-MM-DD. */
  date: string;
  /** 0 nothing, 1 a little, 2 some, 3 a lot. */
  level: 0 | 1 | 2 | 3;
  future: boolean;
}

/**
 * Weeks as columns, Monday at the top, oldest on the left. Quiet by design: a day is lit
 * or it is not, in three warm steps. The whole grid is one picture to a screen reader,
 * described by `label`; the squares themselves say nothing.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A month name over the first week of each month (and over the first column). */
function monthLabels(cells: readonly HeatmapCell[], weeks: number): { column: number; name: string }[] {
  const labels: { column: number; name: string }[] = [];
  let last = -1;
  for (let column = 0; column < weeks; column++) {
    const date = cells[column * 7]?.date;
    if (!date) continue;
    const month = Number(date.slice(5, 7)) - 1;
    if (month !== last) labels.push({ column, name: MONTHS[month] ?? '' });
    last = month;
  }
  // a label squeezed into the very first column next to another reads as clutter
  return labels.length > 1 && labels[1]!.column - labels[0]!.column < 2 ? labels.slice(1) : labels;
}

export function Heatmap({ cells, weeks, label }: { cells: readonly HeatmapCell[]; weeks: number; label: string }) {
  const lastPast = cells.reduce((at, c, i) => (c.future ? at : i), -1);
  return (
    <figure className="ln-heat">
      <div className="ln-heat__board" style={{ '--heat-weeks': weeks } as CSSProperties}>
        <div className="ln-heat__months" aria-hidden="true">
          {monthLabels(cells, weeks).map((m) => (
            <span key={m.column} style={{ gridColumn: m.column + 1 }}>
              {m.name}
            </span>
          ))}
        </div>
        <div className="ln-heat__days" aria-hidden="true">
          <span>M</span>
          <span />
          <span>W</span>
          <span />
          <span>F</span>
          <span />
          <span />
        </div>
        <div className="ln-heat__grid" role="img" aria-label={label}>
          {cells.map((c, i) => (
            <span
              key={c.date}
              className="ln-heat__cell"
              data-level={c.level}
              data-future={c.future ? '' : undefined}
              data-today={i === lastPast ? '' : undefined}
            />
          ))}
        </div>
      </div>
      <figcaption className="ln-heat__legend" aria-hidden="true">
        <span>less</span>
        {([0, 1, 2, 3] as const).map((level) => (
          <span key={level} className="ln-heat__cell" data-level={level} />
        ))}
        <span>more</span>
      </figcaption>
    </figure>
  );
}

/* ---------- Meter ---------- */

interface MeterProps {
  value: number;
  /** The target. Zero or less means there is none, and the bar stays empty. */
  max: number;
  colour?: string;
  /** Read out by screen readers, for example "DSA in JavaScript: 40 min of 2 h". */
  label: string;
}

/** A thin bar for one track's week. It fills to its target and stops there; going over is not shown as better. */
export function Meter({ value, max, colour, label }: MeterProps) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      className="ln-meter"
      role="img"
      aria-label={label}
      data-met={max > 0 && value >= max ? '' : undefined}
      style={{ '--meter-colour': colour, '--meter-fill': fraction } as CSSProperties}
    >
      <span className="ln-meter__fill" />
    </span>
  );
}

/* ---------- Stat ---------- */

/** One number and what it is. Use inside `<dl className="ln-stats">`. */
export function Stat({ value, label, note }: { value: ReactNode; label: string; note?: string }) {
  return (
    <div className="ln-stat">
      <dt className="ln-stat__label">{label}</dt>
      <dd className="ln-stat__value">
        <span className="ln-mono">{value}</span>
      </dd>
      {note && <dd className="ln-stat__note">{note}</dd>}
    </div>
  );
}

/* ---------- Week card ---------- */

interface WeekCardProps {
  to: string;
  minutes: number;
  /** Total weekly target in minutes; zero hides the ring's fill. */
  targetMinutes: number;
  /** What the card says, for example "2 h 30 min of 9 h this week". */
  line: string;
  /** Short text inside the ring. */
  centre: ReactNode;
}

/** Today's calm progress ring: this week's focus against its target, opening the Progress screen. */
export function WeekCard({ to, minutes, targetMinutes, line, centre }: WeekCardProps) {
  return (
    <Link to={to} className="ln-week">
      {/* The sentence beside the ring says it all, so the ring is decoration to a screen reader. */}
      <span aria-hidden="true" className="ln-week__ring">
        <ProgressRing value={minutes} max={targetMinutes} size={68} label={line}>
          {centre}
        </ProgressRing>
      </span>
      <span className="ln-week__body">
        <span className="ln-week__title">This week’s focus</span>
        <span className="ln-week__line">{line}</span>
      </span>
      <svg className="ln-row__go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
