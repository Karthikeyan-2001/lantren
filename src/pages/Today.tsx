import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useLantern } from '../data/store';
import type { Review } from '../data/types';
import { useToday } from '../data/useToday';
import { countWord, dayMarkLabel, lanternFlames, longDate, relativeDay, trackColour } from '../data/view';
import { hoursText, weekLine } from '../progress/copy';
import { weeklyFocus } from '../progress/stats';
import { enableReminders, useReminderStatus } from '../reminders/useReminders';
import { groupForToday } from '../scheduler';
import { WeekCard } from '../ui/Progress';
import { Screen } from '../ui/Screen';
import { TopicRow } from '../ui/TopicRow';
import { Button, EmptyState, Notice, Offer } from '../ui/controls';

export function TodayPage() {
  const today = useToday();
  const status = useLantern((s) => s.status);
  const topics = useLantern((s) => s.topics);
  const reviews = useLantern((s) => s.reviews);
  const tracks = useLantern((s) => s.tracks);
  const sessions = useLantern((s) => s.focusSessions);
  const noticeText = useLantern((s) => s.notice);
  const dismiss = useLantern((s) => s.dismissNotice);

  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const groups = useMemo(() => {
    const live = reviews.filter((r) => {
      const topic = topicById.get(r.topicId);
      return topic && topic.status !== 'archived';
    });
    return groupForToday(live, today);
  }, [reviews, topicById, today]);

  const week = useMemo(() => weeklyFocus(sessions, tracks, today), [sessions, tracks, today]);
  const weekCard = (
    <WeekCard
      to="/progress"
      minutes={week.totalMinutes}
      targetMinutes={week.totalTargetMinutes}
      line={weekLine(week)}
      centre={
        <>
          <span className="ln-mono">{hoursText(week.totalMinutes)}</span>
          <br />
          <span className="ln-small ln-muted">h</span>
        </>
      }
    />
  );

  const notice = noticeText && <Notice onDismiss={dismiss}>{noticeText}</Notice>;

  if (status === 'loading')
    return (
      <Screen kicker={longDate(today)} title="Today">
        {null}
      </Screen>
    );

  if (status === 'error') {
    return (
      <Screen kicker={longDate(today)} title="The desk is stuck">
        <EmptyState title="Storage did not open">
          <p>Everything lives on this device. Closing and reopening Lantern usually sorts it out.</p>
        </EmptyState>
      </Screen>
    );
  }

  if (topics.length === 0) {
    return (
      <Screen
        kicker={longDate(today)}
        title="Nothing waiting yet"
        lede="A quiet desk. Reviews will gather here on day 4 and day 7."
      >
        <EmptyState title="Light your first lantern">
          <p>Capture something you studied today. Two small flames will be set for it, and I will remind you.</p>
          <Link to="/capture" className="ln-btn ln-btn--ember">
            Capture a topic
          </Link>
        </EmptyState>
        {weekCard}
      </Screen>
    );
  }

  const waiting = groups.dueToday.length + groups.overdue.length;
  const next = groups.comingUp[0];
  const title = waiting > 0 ? `${countWord(waiting)} to revisit` : 'A quiet day';
  const lede =
    waiting > 0
      ? 'A few unhurried minutes with each.'
      : next
        ? `Nothing to revisit today. The next flame wakes ${relativeDay(next.dueOn, today)}.`
        : 'Nothing to revisit. Capture something new, or simply rest.';

  const row = (review: Review, meta: string, open = false) => {
    const topic = topicById.get(review.topicId);
    if (!topic) return null;
    const track = trackById.get(topic.trackId);
    return (
      <TopicRow
        key={review.id}
        title={topic.title}
        flames={lanternFlames(topic, reviews, today)}
        colour={trackColour(track)}
        trackName={track?.name}
        meta={meta}
        to={open ? `/review/${review.id}` : undefined}
      />
    );
  };

  return (
    <Screen kicker={longDate(today)} title={title} lede={lede}>
      {notice}
      <ReminderOffer />

      {groups.dueToday.length > 0 && (
        <Group title="Due today" count={groups.dueToday.length}>
          {groups.dueToday.map((r) => row(r, dayMarkLabel(r), true))}
        </Group>
      )}

      {groups.overdue.length > 0 && (
        <Group title="Waiting for you" note="No rush. They keep.">
          {groups.overdue.map((r) => row(r, `${dayMarkLabel(r)}, ${relativeDay(r.dueOn, today)}`, true))}
        </Group>
      )}

      {groups.comingUp.length > 0 && (
        <Group title="Coming up" note="the next seven days">
          {groups.comingUp.map((r) => row(r, `${dayMarkLabel(r)}, ${relativeDay(r.dueOn, today)}`))}
        </Group>
      )}

      {waiting === 0 && !next && (
        <EmptyState title="Every lantern is tended">
          <p>Nothing due this week. A good moment to learn something new.</p>
          <Link to="/capture" className="ln-btn ln-btn--quiet">
            Capture a topic
          </Link>
        </EmptyState>
      )}

      {weekCard}
    </Screen>
  );
}

/**
 * Asked once, after the first topic exists: would a reminder help? Either answer puts
 * the question away for good; Settings keeps the switch.
 */
function ReminderOffer() {
  const reminders = useLantern((s) => s.settings.reminders);
  const seen = useLantern((s) => s.settings.reminderOfferSeen);
  const update = useLantern((s) => s.updateSettings);
  const { permission } = useReminderStatus();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  if (reminders || seen || permission === null || permission === 'unsupported') return null;

  const putAway = () => void update({ reminderOfferSeen: true }).catch(() => undefined);
  const accept = async () => {
    setBusy(true);
    try {
      if ((await enableReminders()) !== 'granted') setRefused(true);
    } catch (error) {
      console.warn('Reminders did not switch on', error);
    } finally {
      setBusy(false);
    }
  };

  if (refused) {
    return (
      <Offer title="No reminders, then" actions={<Button onClick={putAway}>Okay</Button>}>
        Notifications are off for Lantern on this device. If you change your mind, the switch is in Settings.
      </Offer>
    );
  }
  return (
    <Offer
      title="Want a nudge on review days?"
      actions={
        <>
          <Button variant="ember" disabled={busy} onClick={accept}>
            Turn on reminders
          </Button>
          <Button variant="ghost" disabled={busy} onClick={putAway}>
            Not now
          </Button>
        </>
      }
    >
      One quiet reminder in the evening when a review is due. You can change the time in Settings.
    </Offer>
  );
}

function Group({
  title,
  note,
  count,
  children,
}: {
  title: string;
  note?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="ln-group" aria-label={title}>
      <header className="ln-group__head">
        <h2>{title}</h2>
        {note && <span className="ln-group__note">{note}</span>}
        {count !== undefined && <span className="ln-group__note ln-mono">{count}</span>}
      </header>
      <ul className="ln-rows">{children}</ul>
    </section>
  );
}
