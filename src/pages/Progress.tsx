import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useLantern } from '../data/store';
import { useToday } from '../data/useToday';
import { completionWords, formatMinutes, heatmapLabel, streakLine, streakUnit, weekLine } from '../progress/copy';
import { activityByDay, heatmap, lockedCount, reviewCompletion, streakFor, weeklyFocus } from '../progress/stats';
import { Hearth } from '../ui/Hearth';
import { Heatmap, Meter, Stat } from '../ui/Progress';
import { Screen } from '../ui/Screen';

/**
 * Progress: how the lamp has been burning. One gentle streak, twelve weeks of study days,
 * this week's focus against each track's target, and how reviews are going. No rankings,
 * no badges, and a day missed is never shown as a loss.
 */
export function ProgressPage() {
  const today = useToday();
  const tracks = useLantern((s) => s.tracks);
  const topics = useLantern((s) => s.topics);
  const reviews = useLantern((s) => s.reviews);
  const sessions = useLantern((s) => s.focusSessions);

  const activity = useMemo(() => activityByDay(topics, reviews, sessions), [topics, reviews, sessions]);
  const streak = useMemo(() => streakFor(new Set(activity.keys()), today), [activity, today]);
  const map = useMemo(() => heatmap(activity, today), [activity, today]);
  const week = useMemo(() => weeklyFocus(sessions, tracks, today), [sessions, tracks, today]);
  const completion = useMemo(() => reviewCompletion(reviews, topics, today), [reviews, topics, today]);
  const locked = lockedCount(topics);
  const words = completionWords(completion);
  const heatLabel = heatmapLabel(map.studiedDays, map.weeks);

  return (
    <Screen kicker="progress" title="How the lamp has burned" lede="A quiet look back. Nothing here is a score.">
      <Link to="/today" replace className="ln-btn ln-btn--ghost ln-back">
        ← Today
      </Link>

      <section className="ln-section ln-panel ln-panel--warm" aria-label="Streak">
        <h2>A gentle streak</h2>
        <div className="ln-streak">
          <Hearth mood={streak.todayDone ? 'ready' : streak.days > 0 ? 'held' : 'dark'} mini />
          <p className="ln-streak__number">
            <span className="ln-mono">{streak.days}</span>
            <span className="ln-muted">{streakUnit(streak.days)} in a row</span>
          </p>
        </div>
        <p className="ln-small ln-muted">{streakLine(streak)}</p>
      </section>

      <section className="ln-section ln-panel" aria-label="Study days">
        <h2>The last twelve weeks</h2>
        <Heatmap cells={map.cells} weeks={map.weeks} label={heatLabel} />
        <p className="ln-small ln-muted" aria-hidden="true">
          {heatLabel}
        </p>
      </section>

      <section className="ln-section ln-panel" aria-label="Focus this week">
        <h2>Focus this week</h2>
        <p className="ln-small ln-muted">{weekLine(week)}</p>
        <div>
          {week.tracks.map((t) => {
            const spent = formatMinutes(t.minutes);
            const text = t.targetMinutes > 0 ? `${spent} of ${formatMinutes(t.targetMinutes)}` : spent;
            return (
              <div key={t.trackId} className="ln-meter-row">
                <div className="ln-meter-row__head" aria-hidden="true">
                  <span>{t.name}</span>
                  <span className="ln-muted ln-mono">{text}</span>
                </div>
                <Meter
                  value={t.minutes}
                  max={t.targetMinutes}
                  colour={`var(--track-${t.colour})`}
                  label={`${t.name}: ${text}`}
                />
              </div>
            );
          })}
        </div>
        {week.otherMinutes > 0 && (
          <p className="ln-small ln-muted">Another {formatMinutes(week.otherMinutes)} on tracks that are put away.</p>
        )}
        <div className="ln-wrap">
          <Link to="/tracks" className="ln-btn ln-btn--quiet">
            Edit tracks and targets
          </Link>
          <Link to="/focus" className="ln-btn ln-btn--ghost">
            Start a session
          </Link>
        </div>
      </section>

      <section className="ln-section ln-panel" aria-label="Reviews">
        <h2>Reviews</h2>
        <dl className="ln-stats">
          <Stat value={words.value} label="Reviews done" note={words.note} />
          <Stat
            value={locked}
            label="Locked in"
            note={locked === 1 ? 'topic is yours now.' : 'topics are yours now.'}
          />
        </dl>
      </section>
    </Screen>
  );
}
