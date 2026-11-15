import { useMemo } from 'react';
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

      <Link to="/progress" className="ln-btn ln-btn--quiet ln-btn--block">
        Your progress
      </Link>
      <Link to="/tracks" className="ln-btn ln-btn--quiet ln-btn--block">
        Tracks
      </Link>
      <Link to="/settings" className="ln-btn ln-btn--quiet ln-btn--block">
        Settings
      </Link>
      <Link to="/styleguide" className="ln-btn ln-btn--ghost ln-btn--block">
        Open the style guide
      </Link>
    </Screen>
  );
}
