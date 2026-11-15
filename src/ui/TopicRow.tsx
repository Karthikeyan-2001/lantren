import type { ReactNode } from 'react';

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
}

/** A topic in a list: its lantern, its title, and one line of context. Use inside `<ul className="ln-rows">`. */
export function TopicRow({ title, flames, colour, trackName, meta }: TopicRowProps) {
  return (
    <li className="ln-row">
      <Lantern day4={flames[0]} day7={flames[1]} colour={colour} compact />
      <div className="ln-row__body">
        <span className="ln-row__title">{title}</span>
        {(trackName || meta) && (
          <span className="ln-row__meta">
            {trackName}
            {trackName && meta && <span aria-hidden="true"> · </span>}
            {meta}
          </span>
        )}
      </div>
    </li>
  );
}
