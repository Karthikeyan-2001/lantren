import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { ReviewOutcome } from '../data/repo';
import { useLantern } from '../data/store';
import type { Review, Topic } from '../data/types';
import { useToday } from '../data/useToday';
import {
  KIND_LABELS,
  dayMarkLabel,
  lanternFlames,
  nextForTopic,
  nextWaiting,
  outcomeCopy,
  relativeDay,
  shortDate,
  trackColour,
} from '../data/view';
import { toLocalDate, type LocalDate } from '../scheduler';
import { Lantern } from '../ui/Lantern';
import { Screen } from '../ui/Screen';
import { Button, EmptyState, Pill, RecallRating, Steps, TextArea, type RecallValue } from '../ui/controls';

type Step = 'recall' | 'reveal' | 'done';

/**
 * The review flow: recall first with only the title showing, then reveal the notes and
 * rate honestly. The scheduler decides what happens next; this screen only asks and tells.
 */
const STEPS = ['Recall', 'Compare', 'Done'] as const;

export function ReviewPage() {
  const { reviewId = '' } = useParams();
  // A fresh flow for every review, even when Ionic reuses the page.
  return <ReviewFlow key={reviewId} reviewId={reviewId} />;
}

function ReviewFlow({ reviewId }: { reviewId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const status = useLantern((s) => s.status);
  const reviews = useLantern((s) => s.reviews);
  const topics = useLantern((s) => s.topics);
  const tracks = useLantern((s) => s.tracks);
  const rate = useLantern((s) => s.review);
  const snooze = useLantern((s) => s.snooze);

  const [step, setStep] = useState<Step>('recall');
  const [attempt, setAttempt] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<(ReviewOutcome & { recall: RecallValue }) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ratingId = useId();

  // Move focus to each step's heading so a screen reader hears where it is.
  useEffect(() => {
    if (step !== 'recall') headingRef.current?.focus();
  }, [step]);

  const review = reviews.find((r) => r.id === reviewId);
  const topic = review && topics.find((t) => t.id === review.topicId);
  const track = topic && tracks.find((t) => t.id === topic.trackId);

  if (status === 'loading') {
    return (
      <Screen kicker="review" title="">
        {null}
      </Screen>
    );
  }

  if (!review || !topic || topic.status === 'archived') {
    return (
      <Screen kicker="review" title="This one has moved on">
        <EmptyState title="Nothing to revisit here">
          <p>It may have been tended already. Today has whatever is waiting.</p>
          <Link to="/today" replace className="ln-btn ln-btn--quiet">
            Back to Today
          </Link>
        </EmptyState>
      </Screen>
    );
  }

  // Already rated, and not in this visit: say so instead of asking again.
  if (review.doneAt && !outcome) {
    return (
      <Screen kicker={`review · ${dayMarkLabel(review)}`} title={topic.title}>
        <EmptyState title="Already tended">
          <p>You revisited this on {shortDate(toLocalDate(new Date(review.doneAt)))}. Nothing more to do here.</p>
          <Link to="/today" replace className="ln-btn ln-btn--quiet">
            Back to Today
          </Link>
        </EmptyState>
      </Screen>
    );
  }

  const isDsa = topic.kind === 'dsa-problem';
  const kicker = [dayMarkLabel(review), track?.name].filter(Boolean).join(' · ');

  const onRate = async (recall: RecallValue) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await rate(review.id, recall);
      setOutcome({ ...result, recall });
      setStep('done');
    } catch (error) {
      console.warn('Review did not save', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const onSnooze = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await snooze(review.id);
      navigate('/today', { replace: true });
    } catch (error) {
      console.warn('Snooze did not save', error);
      setFailed(true);
      setBusy(false);
    }
  };

  if (step === 'done' && outcome) {
    return (
      <Screen kicker={kicker} title={topic.title}>
        <Steps steps={STEPS} current={2} />
        <Done
          topic={outcome.topic}
          outcome={outcome}
          reviews={reviews}
          topics={topics}
          today={today}
          colour={trackColour(track)}
          headingRef={headingRef}
        />
      </Screen>
    );
  }

  return (
    <Screen
      kicker={kicker}
      title={topic.title}
      lede={
        step === 'recall'
          ? isDsa
            ? 'Solve it again, from scratch, in JavaScript. Your notes stay hidden until you are done.'
            : 'Before you look: what do you remember? Rough is fine.'
          : undefined
      }
    >
      <Steps steps={STEPS} current={step === 'recall' ? 0 : 1} />
      {step === 'recall' ? (
        <section className="ln-review" aria-label="Recall">
          {isDsa && topic.dsa?.problemUrl && (
            <a className="ln-btn ln-btn--quiet" href={topic.dsa.problemUrl} target="_blank" rel="noreferrer">
              Open the problem
            </a>
          )}
          <TextArea
            label={isDsa ? 'Your solution' : 'What comes back'}
            placeholder={isDsa ? 'function solve(input) {\n  \n}' : 'a few lines, in your own words'}
            hint={isDsa ? 'Sketch it here or in your editor.' : "Type, or tap your keyboard's mic and say it."}
            className={isDsa ? 'ln-field__control ln-review__code' : 'ln-field__control ln-field__control--lined'}
            spellCheck={!isDsa}
            autoCapitalize={isDsa ? 'off' : undefined}
            autoCorrect={isDsa ? 'off' : undefined}
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
          />
          <div className="ln-review__actions">
            <Button variant="ember" block onClick={() => setStep('reveal')}>
              {isDsa ? 'Compare with my notes' : 'Show my notes'}
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={onSnooze}>
              Not today, ask me tomorrow
            </Button>
            {failed && (
              <p className="ln-form__preview" role="status">
                That did not save. Try once more.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="ln-review" aria-label="Your notes">
          <h2 ref={headingRef} tabIndex={-1} className="ln-sr">
            Your notes
          </h2>
          <Sheet topic={topic} attempt={attempt} isDsa={isDsa} />
          <div className="ln-review__actions">
            <h2 id={ratingId} className="ln-review__step">
              How did it come back?
            </h2>
            <RecallRating onRate={onRate} disabled={busy} labelledBy={ratingId} />
            {failed && (
              <p className="ln-form__preview" role="status">
                That did not save. Your answer is still here; try once more.
              </p>
            )}
            <Button variant="ghost" block onClick={() => setStep('recall')}>
              Back to recall
            </Button>
          </div>
        </section>
      )}
    </Screen>
  );
}

/** The original notes, shown beside what the user just recalled. */
function Sheet({ topic, attempt, isDsa }: { topic: Topic; attempt: string; isDsa: boolean }) {
  const dsa = topic.dsa;
  const facts = [
    dsa?.pattern,
    dsa?.minutesTaken ? `${dsa.minutesTaken} min first time` : undefined,
    dsa?.solvedWithoutHints === true ? 'no hints' : dsa?.solvedWithoutHints === false ? 'with hints' : undefined,
  ].filter((f): f is string => Boolean(f));
  return (
    <div className="ln-card ln-review__sheet ln-index">
      {attempt.trim() && (
        <div>
          <h3>{isDsa ? 'Your solution today' : 'What came back'}</h3>
          <p className={isDsa ? 'ln-review__text ln-review__text--mono' : 'ln-review__text'}>{attempt.trim()}</p>
        </div>
      )}
      <div>
        <h3>Your notes, {shortDate(topic.studiedOn)}</h3>
        {topic.notes ? (
          <p className="ln-review__text">{topic.notes}</p>
        ) : (
          <p className="ln-review__text ln-muted">No notes were saved for this one. Your memory is the notes now.</p>
        )}
      </div>
      {facts.length > 0 && (
        <div>
          <h3>{KIND_LABELS[topic.kind]}</h3>
          <div className="ln-review__facts">
            {facts.map((f) => (
              <Pill key={f}>{f}</Pill>
            ))}
          </div>
        </div>
      )}
      {(dsa?.problemUrl || topic.sourceUrl) && (
        <div>
          <h3>Links</h3>
          {[dsa?.problemUrl, topic.sourceUrl]
            .filter((u): u is string => Boolean(u))
            .map((u) => (
              <p key={u}>
                <a className="ln-link" href={u} target="_blank" rel="noreferrer">
                  {u}
                </a>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

function Done({
  topic,
  outcome,
  reviews,
  topics,
  today,
  colour,
  headingRef,
}: {
  topic: Topic;
  outcome: ReviewOutcome & { recall: RecallValue };
  reviews: readonly Review[];
  topics: readonly Topic[];
  today: LocalDate;
  colour?: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [day4, day7] = lanternFlames(topic, reviews, today);
  const copy = outcomeCopy(
    {
      recall: outcome.recall,
      dayMark: outcome.review.dayMark,
      justLockedIn: outcome.justLockedIn,
      added: outcome.added,
      next: nextForTopic(reviews, topic.id),
    },
    today,
  );
  const next = nextWaiting(reviews, topics, today, outcome.review.id);
  const nextTopic = next && topics.find((t) => t.id === next.topicId);

  return (
    <section className="ln-review" aria-label="Saved">
      <div className="ln-arch ln-review__done" role="status">
        <Lantern day4={day4} day7={day7} colour={colour} />
        <h2 ref={headingRef} tabIndex={-1} className="ln-review__step">
          {copy.title}
        </h2>
        <p>{copy.body}</p>
      </div>
      <div className="ln-review__actions">
        {next && nextTopic ? (
          <>
            <Link to={`/review/${next.id}`} replace className="ln-btn ln-btn--ember ln-btn--block">
              Next: {nextTopic.title}
            </Link>
            <p className="ln-form__preview">
              {dayMarkLabel(next)}, {relativeDay(next.dueOn, today)}
            </p>
            <Link to="/today" replace className="ln-btn ln-btn--ghost ln-btn--block">
              That is enough for now
            </Link>
          </>
        ) : (
          <Link to="/today" replace className="ln-btn ln-btn--ember ln-btn--block">
            Back to Today
          </Link>
        )}
      </div>
    </section>
  );
}
