import { IonContent, IonPage } from '@ionic/react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';

import { useLantern } from '../data/store';
import type { Settings, Topic, Track } from '../data/types';
import { useToday } from '../data/useToday';
import { trackColour } from '../data/view';
import { FOCUS, SLEEP_FADE_MINUTES, SOUND_KINDS, type SleepFade, type SoundChoice } from '../focus/config';
import { SOUND_LABELS, focusSummary, minutesWord } from '../focus/copy';
import {
  formatClock,
  isPaused,
  isValidLength,
  remainingMs,
  spokenRemaining,
  suggestBreak,
  type FinishedFocus,
  type FocusRun,
} from '../focus/session';
import { ambient, useFocus, useNow } from '../focus/useFocus';
import { toLocalDate } from '../scheduler';
import { Hearth } from '../ui/Hearth';
import { Screen } from '../ui/Screen';
import { Button, Choice, RangeField, SelectField, TextField, Toggle } from '../ui/controls';

type LengthChoice = `${number}` | 'custom';

const LENGTH_OPTIONS: readonly { value: LengthChoice; label: string }[] = [
  ...FOCUS.PRESET_MINUTES.map((m) => ({ value: `${m}` as const, label: `${m}` })),
  { value: 'custom', label: 'Custom' },
];
const SOUND_OPTIONS: readonly { value: SoundChoice; label: string }[] = (['off', ...SOUND_KINDS] as const).map(
  (value) => ({ value, label: SOUND_LABELS[value] }),
);
const FADE_OPTIONS = SLEEP_FADE_MINUTES.map((m) => ({ value: `${m}` as const, label: m === 0 ? 'Never' : `${m} min` }));

/** How long "Welcome back" stays up after returning to a running session. */
const WELCOME_MS = 8000;

/**
 * Focus: one flame, one timer. Setup is an ordinary screen; once a session begins the
 * navigation steps aside and the flame, the time left and a place to park stray thoughts
 * are all there is. Timer rules live in `src/focus`; this screen only draws them.
 */
export function FocusPage() {
  const phase = useFocus((s) => s.phase);
  const begin = useFocus((s) => s.begin);
  const settings = useLantern((s) => s.settings);
  const tracks = useLantern((s) => s.tracks);
  const topics = useLantern((s) => s.topics);
  const updateSettings = useLantern((s) => s.updateSettings);

  const [chosenTrackId, setChosenTrackId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each phase is a new scene: move focus to its heading so a screen reader says where it is.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    headingRef.current?.focus();
  }, [phase]);

  const save = (patch: Partial<Omit<Settings, 'id'>>) =>
    void updateSettings(patch).catch((error: unknown) => console.warn('Focus setting did not save', error));

  const live = tracks.filter((t) => !t.archived);
  const linkable = topics.filter((t) => t.status !== 'archived');
  const topic = linkable.find((t) => t.id === topicId);
  const trackId =
    topic?.trackId ??
    [chosenTrackId, settings.focusTrackId, settings.lastTrackId].find((id) => id && live.some((t) => t.id === id)) ??
    undefined;

  const start = () => {
    // Inside the tap, so the browser allows sound for the whole session.
    ambient.unlock();
    save({ focusTrackId: trackId ?? null });
    begin({ minutes: settings.focusMinutes, topicId: topic?.id, trackId });
  };

  if (phase === 'idle') {
    return (
      <Setup
        settings={settings}
        tracks={live}
        topics={linkable}
        trackId={trackId}
        topicId={topic?.id ?? ''}
        headingRef={headingRef}
        onTrack={(id) => {
          setChosenTrackId(id);
          if (topic && topic.trackId !== id) setTopicId('');
        }}
        onTopic={setTopicId}
        onSave={save}
        onBegin={start}
      />
    );
  }

  return (
    <IonPage>
      <IonContent>
        {/* Any tap unlocks sound, for a session picked up after the app was closed. */}
        <main className="ln-focus" data-phase={phase} onPointerDown={() => ambient.unlock()}>
          {phase === 'focus' && <Running headingRef={headingRef} settings={settings} onSave={save} />}
          {phase === 'done' && <Done headingRef={headingRef} />}
          {phase === 'break' && <Break headingRef={headingRef} />}
          {phase === 'breakOver' && (
            <BreakOver headingRef={headingRef} minutes={settings.focusMinutes} onBegin={start} />
          )}
        </main>
      </IonContent>
    </IonPage>
  );
}

type HeadingRef = RefObject<HTMLHeadingElement | null>;

/* ---------- Setup ---------- */

function Setup({
  settings,
  tracks,
  topics,
  trackId,
  topicId,
  headingRef,
  onTrack,
  onTopic,
  onSave,
  onBegin,
}: {
  settings: Settings;
  tracks: readonly Track[];
  topics: readonly Topic[];
  trackId: string | undefined;
  topicId: string;
  headingRef: HeadingRef;
  onTrack: (id: string) => void;
  onTopic: (id: string) => void;
  onSave: (patch: Partial<Omit<Settings, 'id'>>) => void;
  onBegin: () => void;
}) {
  const [customOpen, setCustomOpen] = useState<boolean | null>(null);
  const [customText, setCustomText] = useState<string | null>(null);

  const minutes = settings.focusMinutes;
  const isPreset = FOCUS.PRESET_MINUTES.some((m) => m === minutes);
  const custom = customOpen ?? !isPreset;
  const shownCustom = customText ?? String(minutes);
  const customValid = isValidLength(Number(shownCustom));
  const ready = custom ? customValid : isValidLength(minutes);

  const onLength = (value: LengthChoice) => {
    if (value === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setCustomText(null);
    onSave({ focusMinutes: Number(value) });
  };
  const onCustom = (text: string) => {
    setCustomText(text);
    if (isValidLength(Number(text))) onSave({ focusMinutes: Number(text) });
  };

  const byRecent = [...topics].sort((a, b) => b.studiedOn.localeCompare(a.studiedOn));

  return (
    <Screen kicker="focus" title="One flame, one thing" lede="Pick a length and begin. Everything else can wait.">
      <form
        className="ln-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (ready) onBegin();
        }}
      >
        <h2 ref={headingRef} tabIndex={-1} className="ln-sr">
          Set up a session
        </h2>
        <div className="ln-focus__preview">
          <Hearth mood="ready" compact />
          <p className="ln-timer__digits" aria-hidden="true">
            {formatClock((ready ? (custom ? Number(shownCustom) : minutes) : 0) * 60_000)}
          </p>
        </div>

        <Choice
          legend="Length, in minutes"
          options={LENGTH_OPTIONS}
          value={custom ? 'custom' : (`${minutes}` as LengthChoice)}
          onChange={onLength}
        />
        {custom && (
          <TextField
            label="Custom length"
            type="number"
            inputMode="numeric"
            min={FOCUS.CUSTOM_MIN_MINUTES}
            max={FOCUS.CUSTOM_MAX_MINUTES}
            step={1}
            value={shownCustom}
            onChange={(e) => onCustom(e.target.value)}
            hint={`Whole minutes, ${FOCUS.CUSTOM_MIN_MINUTES} to ${FOCUS.CUSTOM_MAX_MINUTES}.`}
            error={
              customValid
                ? undefined
                : `Somewhere from ${FOCUS.CUSTOM_MIN_MINUTES} to ${FOCUS.CUSTOM_MAX_MINUTES} minutes works best.`
            }
          />
        )}

        {tracks.length > 0 && (
          <Choice
            legend="Track"
            fit
            options={tracks.map((t) => ({ value: t.id, label: t.name, colour: trackColour(t) }))}
            value={trackId ?? null}
            onChange={onTrack}
          />
        )}

        <Choice
          legend="Sound"
          options={SOUND_OPTIONS}
          value={settings.focusSound}
          onChange={(focusSound) => onSave({ focusSound })}
        />

        <details className="ln-details">
          <summary>Topic, volume and chime</summary>
          <div className="ln-details__body">
            {byRecent.length > 0 && (
              <SelectField
                label="Link a topic"
                value={topicId}
                onChange={(e) => onTopic(e.target.value)}
                hint="Optional. The session is filed under the topic's track."
              >
                <option value="">No topic</option>
                {byRecent.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </SelectField>
            )}
            <SoundExtras settings={settings} onSave={onSave} />
            <Toggle
              label="Soft chime at the end"
              hint="Two quiet notes when a session or a break is over."
              checked={settings.focusChime}
              onChange={(focusChime) => onSave({ focusChime })}
            />
          </div>
        </details>

        <div className="ln-form__actions">
          <Button type="submit" variant="ember" block disabled={!ready}>
            Begin
          </Button>
          <p className="ln-form__preview">The screen stays awake while the flame burns.</p>
        </div>
      </form>
    </Screen>
  );
}

/** Volume and the sleep fade: the same two controls in setup and during a session. */
function SoundExtras({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (patch: Partial<Omit<Settings, 'id'>>) => void;
}) {
  const percent = Math.round(settings.focusVolume * 100);
  return (
    <>
      <RangeField
        label="Volume"
        min={0}
        max={100}
        step={5}
        value={percent}
        valueText={`${percent} percent`}
        onChange={(e) => onSave({ focusVolume: Number(e.target.value) / 100 })}
      />
      <Choice
        legend="Fade the sound out after"
        options={FADE_OPTIONS}
        value={`${settings.focusSleepFade}` as (typeof FADE_OPTIONS)[number]['value']}
        onChange={(value) => onSave({ focusSleepFade: Number(value) as SleepFade })}
      />
    </>
  );
}

/* ---------- Running ---------- */

function useLink(run: Pick<FocusRun, 'topicId' | 'trackId'> | FinishedFocus | null) {
  const tracks = useLantern((s) => s.tracks);
  const topics = useLantern((s) => s.topics);
  return {
    track: tracks.find((t) => t.id === run?.trackId),
    topic: topics.find((t) => t.id === run?.topicId),
  };
}

function Running({
  headingRef,
  settings,
  onSave,
}: {
  headingRef: HeadingRef;
  settings: Settings;
  onSave: (patch: Partial<Omit<Settings, 'id'>>) => void;
}) {
  const run = useFocus((s) => s.run);
  const pause = useFocus((s) => s.pause);
  const resume = useFocus((s) => s.resume);
  const endEarly = useFocus((s) => s.endEarly);
  const park = useFocus((s) => s.park);
  const now = useNow(run !== null && !isPaused(run));
  const { track, topic } = useLink(run);
  const [thought, setThought] = useState('');

  if (!run) return null;
  const paused = isPaused(run);
  const left = remainingMs(run, now);
  const level = 0.12 + 0.88 * (left / run.plannedMs);
  const welcomed = run.returnedAt !== null && now - run.returnedAt < WELCOME_MS;
  const kicker = [track?.name, topic?.title].filter(Boolean).join(' · ');

  const onPark = (e: FormEvent) => {
    e.preventDefault();
    park(thought);
    setThought('');
  };

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="ln-sr">
        {paused ? 'Focus session, paused' : 'Focus session'}
      </h1>
      <p className="ln-kicker ln-focus__kicker">{kicker || 'focus'}</p>
      <Hearth mood={paused ? 'held' : 'burning'} level={level} />
      <p className="ln-timer__digits" role="timer" aria-label={spokenRemaining(left)}>
        {formatClock(left)}
      </p>
      <p className="ln-focus__line" role="status">
        {paused ? 'Paused. The flame is holding.' : welcomed ? 'Welcome back. The flame kept going.' : ''}
      </p>

      <form className="ln-focus__park" onSubmit={onPark}>
        <TextField
          label="Park a thought"
          placeholder="anything that can wait"
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
        />
        <Button type="submit" disabled={!thought.trim()}>
          Park
        </Button>
      </form>
      {run.parkingLot.length > 0 && <Parked thoughts={run.parkingLot} title="Parked, safe until later" />}

      <div className="ln-focus__actions">
        {paused ? (
          <Button variant="ember" block onClick={resume}>
            Carry on
          </Button>
        ) : (
          <Button block onClick={pause}>
            Pause
          </Button>
        )}
        <Button variant="ghost" block onClick={endEarly}>
          End here
        </Button>
      </div>

      <details className="ln-details ln-focus__sound">
        <summary>Sound: {SOUND_LABELS[settings.focusSound]}</summary>
        <div className="ln-details__body">
          <Choice
            legend="Sound"
            options={SOUND_OPTIONS}
            value={settings.focusSound}
            onChange={(focusSound) => onSave({ focusSound })}
          />
          <SoundExtras settings={settings} onSave={onSave} />
        </div>
      </details>
    </>
  );
}

function Parked({ thoughts, title }: { thoughts: readonly string[]; title: string }) {
  return (
    <section className="ln-focus__parked" aria-label={title}>
      <p className="ln-kicker">{title}</p>
      <ul>
        {thoughts.map((t, i) => (
          <li key={`${i}-${t}`}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Done ---------- */

function Done({ headingRef }: { headingRef: HeadingRef }) {
  const session = useFocus((s) => s.session);
  const completed = useFocus((s) => s.completed);
  const saved = useFocus((s) => s.saved);
  const startBreak = useFocus((s) => s.startBreak);
  const reset = useFocus((s) => s.reset);
  const retrySave = useFocus((s) => s.retrySave);
  const sessions = useLantern((s) => s.focusSessions);
  const today = useToday();
  const { track, topic } = useLink(session);

  if (!session) return null;
  const copy = focusSummary(session, completed, track?.name);
  // Sessions begun today, counting this one whether or not its save has landed yet.
  const finishedToday = new Set(
    [...sessions, session].filter((s) => toLocalDate(new Date(s.startedAt)) === today).map((s) => s.id),
  ).size;
  const suggested = suggestBreak(session.plannedMinutes, finishedToday);
  const other = suggested === FOCUS.LONG_BREAK_MINUTES ? FOCUS.SHORT_BREAK_MINUTES : FOCUS.LONG_BREAK_MINUTES;

  return (
    <>
      <p className="ln-kicker ln-focus__kicker">{[track?.name, topic?.title].filter(Boolean).join(' · ') || 'focus'}</p>
      <Hearth mood={completed ? 'glow' : 'held'} level={0.5} />
      <div className="ln-focus__words" role="status">
        <h1 ref={headingRef} tabIndex={-1}>
          {copy.title}
        </h1>
        <p>{copy.body}</p>
      </div>
      {session.parkingLot.length > 0 && <Parked thoughts={session.parkingLot} title="Parked for later" />}
      {saved === 'failed' && (
        <div className="ln-focus__words" role="status">
          <p>This session did not save.</p>
          <Button onClick={retrySave}>Try once more</Button>
        </div>
      )}
      <div className="ln-focus__actions">
        {completed ? (
          <>
            <Button variant="ember" block onClick={() => startBreak(suggested)}>
              Take {minutesWord(suggested)}
            </Button>
            <Button block onClick={() => startBreak(other)}>
              Take {minutesWord(other)}
            </Button>
            <Button variant="ghost" block onClick={reset}>
              Done for now
            </Button>
          </>
        ) : (
          <>
            <Button block onClick={reset}>
              Done for now
            </Button>
            <Button variant="ghost" block onClick={() => startBreak(FOCUS.SHORT_BREAK_MINUTES)}>
              Take {minutesWord(FOCUS.SHORT_BREAK_MINUTES)}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- Break ---------- */

function Break({ headingRef }: { headingRef: HeadingRef }) {
  const endsAt = useFocus((s) => s.breakEndsAt);
  const minutes = useFocus((s) => s.breakMinutes);
  const skip = useFocus((s) => s.skipBreak);
  const now = useNow(true);
  const total = minutes * 60_000;
  const left = Math.min(total, Math.max(0, (endsAt ?? now) - now));

  return (
    <>
      <p className="ln-kicker ln-focus__kicker">break</p>
      {/* The flame comes back as the break runs out. */}
      <Hearth mood="resting" level={total > 0 ? 0.25 + 0.75 * (1 - left / total) : 1} />
      <p className="ln-timer__digits" role="timer" aria-label={spokenRemaining(left)}>
        {formatClock(left)}
      </p>
      <div className="ln-focus__words">
        <h1 ref={headingRef} tabIndex={-1}>
          Rest a little
        </h1>
        <p>Look away from the screen. Stretch, water, a window.</p>
      </div>
      <div className="ln-focus__actions">
        <Button variant="ghost" block onClick={skip}>
          Skip the break
        </Button>
      </div>
    </>
  );
}

function BreakOver({ headingRef, minutes, onBegin }: { headingRef: HeadingRef; minutes: number; onBegin: () => void }) {
  const reset = useFocus((s) => s.reset);
  return (
    <>
      <p className="ln-kicker ln-focus__kicker">break</p>
      <Hearth mood="ready" />
      <Words headingRef={headingRef} title="Ready when you are">
        The break is over. No rush.
      </Words>
      <div className="ln-focus__actions">
        <Button
          variant="ember"
          block
          onClick={() => {
            reset();
            onBegin();
          }}
        >
          Begin another {minutesWord(minutes)}
        </Button>
        <Button variant="ghost" block onClick={reset}>
          Done for now
        </Button>
      </div>
    </>
  );
}

function Words({ headingRef, title, children }: { headingRef: HeadingRef; title: string; children: ReactNode }) {
  return (
    <div className="ln-focus__words" role="status">
      <h1 ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p>{children}</p>
    </div>
  );
}
