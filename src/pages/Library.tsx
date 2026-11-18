import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { useLantern } from '../data/store';
import type { Topic } from '../data/types';
import { useToday } from '../data/useToday';
import { KIND_LABELS, lanternFlames, shortDate, trackColour } from '../data/view';
import { Screen } from '../ui/Screen';
import { TopicRow } from '../ui/TopicRow';
import { EmptyState, Pill } from '../ui/controls';

const STATUS_WORDS: Partial<Record<Topic['status'], string>> = {
  locked: 'locked in',
  leaky: 'leaky, coming back soon',
};

const MENU = [
  { to: '/progress', label: 'Your progress', hint: 'Streak, study days and weekly focus' },
  { to: '/tracks', label: 'Tracks', hint: 'Names, colours and weekly targets' },
  { to: '/settings', label: 'Settings', hint: 'Reminders, theme and your data' },
] as const;

export function LibraryPage() {
  const today = useToday();
  const tracks = useLantern((s) => s.tracks);
  const topics = useLantern((s) => s.topics);
  const reviews = useLantern((s) => s.reviews);

  const shelves = useMemo(() => {
    const byTrack = new Map<string, Topic[]>();
    for (const topic of topics) {
      if (topic.status === 'archived') continue;
      byTrack.set(topic.trackId, [...(byTrack.get(topic.trackId) ?? []), topic]);
    }
    // Newest first within a track; same day falls back to capture time.
    for (const list of byTrack.values()) {
      list.sort((a, b) => b.studiedOn.localeCompare(a.studiedOn) || b.createdAt.localeCompare(a.createdAt));
    }
    return byTrack;
  }, [topics]);

  const live = tracks.filter((t) => !t.archived);
  const filled = live.filter((t) => shelves.has(t.id));
  const quiet = live.filter((t) => !shelves.has(t.id));

  return (
    <Screen kicker="library" title="Your lanterns" lede="Every topic you have studied, by track.">
      {filled.length === 0 && (
        <EmptyState title="The shelf is empty, for now">
          <p>Topics you capture will rest here, each one a small lantern with its day 4 and day 7 flames.</p>
          <Link to="/capture" className="ln-btn ln-btn--quiet">
            Capture a topic
          </Link>
        </EmptyState>
      )}

      {filled.map((track) => {
        const list = shelves.get(track.id) ?? [];
        return (
          <section key={track.id} className="ln-group" aria-label={track.name}>
            <header className="ln-group__head">
              <span className="ln-orb" style={{ '--orb': trackColour(track) } as CSSProperties} aria-hidden="true" />
              <h2>{track.name}</h2>
              <span className="ln-group__note ln-mono">{list.length}</span>
            </header>
            <ul className="ln-rows">
              {list.map((topic) => (
                <TopicRow
                  key={topic.id}
                  title={topic.title}
                  flames={lanternFlames(topic, reviews, today)}
                  colour={trackColour(track)}
                  meta={[KIND_LABELS[topic.kind], `studied ${shortDate(topic.studiedOn)}`, STATUS_WORDS[topic.status]]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {quiet.length > 0 && (
        <section className="ln-section" aria-label="Quiet tracks">
          <p className="ln-small ln-muted">{filled.length === 0 ? 'Your tracks' : 'Still quiet'}</p>
          <div className="ln-wrap">
            {quiet.map((t) => (
              <Pill key={t.id} colour={trackColour(t)}>
                {t.name}
              </Pill>
            ))}
          </div>
        </section>
      )}

      <nav aria-label="More">
        <ul className="ln-menu">
          {MENU.map((m) => (
            <li key={m.to}>
              <Link to={m.to} className="ln-menu__link">
                <span className="ln-menu__label">
                  {m.label}
                  <span className="ln-menu__hint">{m.hint}</span>
                </span>
                <svg className="ln-row__go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link to="/styleguide" className="ln-btn ln-btn--ghost ln-btn--block">
        Open the style guide
      </Link>
    </Screen>
  );
}
