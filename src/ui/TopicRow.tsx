import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { FlameState } from './Flame';
import { Lantern } from './Lantern';

interface TopicRowProps {
  title: string;
  flames: [FlameState, FlameState];
  /** Track colour as a CSS value, shown as the lantern's cap and a dot. */
  colour?: string;
  trackName?: string;
  /** One quiet line under the title, e.g. "day 4, since Thu 12 Nov". */
  meta?: ReactNode;
  /** Makes the whole row open this route; the title is the link's name. */
  to?: string;
}

/** A topic in a list: its lantern, its title, and one line of context. Use inside `<ul className="ln-rows">`. */
export function TopicRow({ title, flames, colour, trackName, meta, to }: TopicRowProps) {
  return (
    <li className={to ? 'ln-row ln-row--link' : 'ln-row'}>
      <Lantern day4={flames[0]} day7={flames[1]} colour={colour} compact />
      <div className="ln-row__body">
        {to ? (
          <Link to={to} className="ln-row__title ln-row__target">
            {title}
          </Link>
        ) : (
          <span className="ln-row__title">{title}</span>
        )}
        {(trackName || meta) && (
          <span className="ln-row__meta">
            {trackName}
            {trackName && meta && <span aria-hidden="true"> · </span>}
            {meta}
          </span>
        )}
      </div>
      {to && (
        <svg className="ln-row__go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </li>
  );
}
