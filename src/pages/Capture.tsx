import { useIonViewDidEnter } from '@ionic/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLantern } from '../data/store';
import { TOPIC_KINDS, type Topic, type TopicKind } from '../data/types';
import { useToday } from '../data/useToday';
import { KIND_LABELS, shortDate, trackColour } from '../data/view';
import { addDays, createReviews, isLocalDate, type LocalDate } from '../scheduler';
import { Flame } from '../ui/Flame';
import { Screen } from '../ui/Screen';
import { Button, Choice, FlameScale, TextArea, TextField } from '../ui/controls';

const KIND_OPTIONS = TOPIC_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }));
const CONFIDENCE_OPTIONS = (['1', '2', '3', '4', '5'] as const).map((value) => ({ value, label: value }));
const HINTS_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'With hints' },
] as const;

type Confidence = (typeof CONFIDENCE_OPTIONS)[number]['value'];

/**
 * Capture: built to take under ten seconds. Title has focus on arrival, the track is
 * remembered, kind follows the track, confidence defaults to the middle, and Enter saves.
 * Everything else is optional and tucked away.
 */
export function CapturePage() {
  const navigate = useNavigate();
  const today = useToday();
  const tracks = useLantern((s) => s.tracks);
  const lastTrackId = useLantern((s) => s.settings.lastTrackId);
  const capture = useLantern((s) => s.capture);
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [chosenTrackId, setChosenTrackId] = useState<string | null>(null);
  const [chosenKind, setChosenKind] = useState<TopicKind | null>(null);
  const [confidence, setConfidence] = useState<Confidence>('3');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [chosenStudiedOn, setChosenStudiedOn] = useState<LocalDate | null>(null);
  const [problemUrl, setProblemUrl] = useState('');
  const [pattern, setPattern] = useState('');
  const [minutes, setMinutes] = useState('');
  const [noHints, setNoHints] = useState<'yes' | 'no' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Focus on first arrival, and on every later visit (Ionic keeps the page mounted).
  useEffect(() => titleRef.current?.focus(), []);
  useIonViewDidEnter(() => titleRef.current?.focus());

  const live = tracks.filter((t) => !t.archived);
  const trackId = [chosenTrackId, lastTrackId].find((id) => id && live.some((t) => t.id === id)) ?? live[0]?.id ?? '';
  const track = live.find((t) => t.id === trackId);
  const kind: TopicKind = chosenKind ?? track?.defaultKind ?? 'concept';
  const studiedOn = chosenStudiedOn ?? today;
  const [first, second] = createReviews({ id: 'preview', studiedOn }, () => 'preview');

  const reset = () => {
    setTitle('');
    setTitleError(undefined);
    setChosenTrackId(null);
    setChosenKind(null);
    setConfidence('3');
    setNotes('');
    setSourceUrl('');
    setChosenStudiedOn(null);
    setProblemUrl('');
    setPattern('');
    setMinutes('');
    setNoHints(null);
    setSaveError(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) {
      setTitleError('A few words is enough, so you will know it again.');
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      const minutesTaken = Number.parseInt(minutes, 10);
      await capture({
        title,
        trackId,
        kind,
        notes,
        confidence: Number(confidence) as Topic['confidence'],
        sourceUrl,
        studiedOn,
        dsa:
          kind === 'dsa-problem'
            ? {
                problemUrl,
                pattern,
                minutesTaken: Number.isFinite(minutesTaken) && minutesTaken > 0 ? minutesTaken : undefined,
                solvedWithoutHints: noHints === null ? undefined : noHints === 'yes',
              }
            : undefined,
      });
      reset();
      navigate('/today', { replace: true });
    } catch (error) {
      console.warn('Capture did not save', error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen kicker="capture" title="What did you study?" lede="A title is enough. The rest can wait.">
      <form className="ln-form" onSubmit={onSubmit} noValidate>
        <TextField
          ref={titleRef}
          label="Topic"
          placeholder="closures and the event loop"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError) setTitleError(undefined);
          }}
          error={titleError}
          enterKeyHint="done"
          autoComplete="off"
          maxLength={200}
          className="ln-field__control ln-field__control--hero"
        />

        <Choice
          legend="Track"
          fit
          options={live.map((t) => ({ value: t.id, label: t.name, colour: trackColour(t) }))}
          value={trackId || null}
          onChange={(id) => {
            setChosenTrackId(id);
            setChosenKind(null);
          }}
        />

        <Choice legend="Kind" options={KIND_OPTIONS} value={kind} onChange={setChosenKind} />

        {kind === 'dsa-problem' && (
          <>
            <TextField
              label="Problem link"
              type="url"
              inputMode="url"
              placeholder="https://leetcode.com/problems/..."
              value={problemUrl}
              onChange={(e) => setProblemUrl(e.target.value)}
              autoComplete="off"
            />
            <div className="ln-field__row">
              <TextField
                label="Pattern"
                placeholder="sliding window"
                list="ln-patterns"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                autoComplete="off"
              />
              <TextField
                label="Minutes taken"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <datalist id="ln-patterns">
              {PATTERNS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <Choice legend="Solved without hints?" options={HINTS_OPTIONS} value={noHints} onChange={setNoHints} />
          </>
        )}

        <FlameScale
          legend="How sure do you feel?"
          options={CONFIDENCE_OPTIONS}
          value={confidence}
          onChange={setConfidence}
        />

        <TextArea
          label="Notes"
          placeholder="a few lines in your own words, for day 4 you"
          className="ln-field__control ln-field__control--lined"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <details className="ln-details">
          <summary>Source link and study date</summary>
          <div className="ln-details__body">
            <TextField
              label="Source link"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              autoComplete="off"
            />
            <TextField
              label="Studied on"
              type="date"
              max={today}
              min={addDays(today, -60)}
              value={studiedOn}
              onChange={(e) => {
                const value = e.target.value;
                if (isLocalDate(value) && value <= today) setChosenStudiedOn(value);
              }}
              hint="Day 1. Leave it as today unless you are catching up."
            />
          </div>
        </details>

        <div className="ln-form__actions">
          <Button type="submit" variant="ember" block disabled={saving || !trackId}>
            {!saving && <Flame state="lit" size={14} />}
            {saving ? 'Saving' : 'Light it'}
          </Button>
          {saveError ? (
            <p className="ln-form__preview" role="status">
              That did not save. Your words are still here; try once more.
            </p>
          ) : (
            first &&
            second && (
              <p className="ln-form__preview">
                Back on {shortDate(first.dueOn)} and {shortDate(second.dueOn)}.
              </p>
            )
          )}
        </div>
      </form>
    </Screen>
  );
}

const PATTERNS = [
  'two pointers',
  'sliding window',
  'binary search',
  'hash map',
  'prefix sum',
  'stack',
  'monotonic stack',
  'heap',
  'linked list',
  'tree traversal',
  'BFS',
  'DFS',
  'backtracking',
  'graph',
  'union find',
  'topological sort',
  'dynamic programming',
  'greedy',
  'intervals',
  'trie',
  'bit manipulation',
];
