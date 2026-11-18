import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { InvalidTrackError, TRACK_NAME_MAX } from '../data/repo';
import { useLantern } from '../data/store';
import { TRACK_COLOURS, type Track, type TrackColour } from '../data/types';
import { formatMinutes, hoursToMinutes } from '../progress/copy';
import { Screen } from '../ui/Screen';
import { Button, Choice, TextField } from '../ui/controls';

const COLOUR_OPTIONS = TRACK_COLOURS.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  colour: `var(--track-${value})`,
}));

const MAX_HOURS = 40;

const minutesToHours = (minutes: number): string => String(Math.round((minutes / 60) * 100) / 100);

const targetWords = (minutes: number): string => (minutes > 0 ? `${formatMinutes(minutes)} a week` : 'no target');

/** Tracks: name them, colour them, set a weekly focus target, or put one away. */
export function TracksPage() {
  const tracks = useLantern((s) => s.tracks);
  const ordered = [...tracks].sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order);
  const used = new Set(tracks.filter((t) => !t.archived).map((t) => t.colour));
  const nextColour = TRACK_COLOURS.find((c) => !used.has(c)) ?? TRACK_COLOURS[tracks.length % TRACK_COLOURS.length];

  return (
    <Screen
      kicker="tracks"
      title="Your tracks"
      lede="Name them, colour them, and say how much focus each deserves in a week."
    >
      <Link to="/library" replace className="ln-btn ln-btn--ghost ln-back">
        ← Library
      </Link>

      <section className="ln-panel ln-panel--list" aria-label="Tracks">
        {ordered.map((track) => (
          <TrackEditor key={track.id} track={track} />
        ))}
      </section>

      <section className="ln-section ln-panel" aria-label="Add a track">
        <h2>Add a track</h2>
        {/* Keyed by the track count so the form starts fresh after each one is added. */}
        <NewTrack key={tracks.length} colour={nextColour ?? 'ember'} />
      </section>
    </Screen>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof InvalidTrackError) return error.message;
  console.warn('Track did not save', error);
  return 'That did not save. Try once more.';
}

interface Fields {
  name: string;
  colour: TrackColour;
  hours: string;
}

function TrackFields({
  fields,
  onChange,
  nameError,
  hoursError,
}: {
  fields: Fields;
  onChange: (next: Fields) => void;
  nameError?: string;
  hoursError?: string;
}) {
  return (
    <>
      <TextField
        label="Name"
        value={fields.name}
        maxLength={TRACK_NAME_MAX}
        onChange={(e) => onChange({ ...fields, name: e.target.value })}
        error={nameError}
        autoComplete="off"
      />
      <Choice
        legend="Colour"
        options={COLOUR_OPTIONS}
        value={fields.colour}
        onChange={(colour) => onChange({ ...fields, colour })}
      />
      <TextField
        label="Weekly focus target, in hours"
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_HOURS}
        step={0.5}
        value={fields.hours}
        onChange={(e) => onChange({ ...fields, hours: e.target.value })}
        hint="Leave it at 0 for no target."
        error={hoursError}
      />
    </>
  );
}

function TrackEditor({ track }: { track: Track }) {
  const edit = useLantern((s) => s.editTrack);
  const [fields, setFields] = useState<Fields>({
    name: track.name,
    colour: track.colour,
    hours: minutesToHours(track.weeklyTargetMinutes),
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const minutes = hoursToMinutes(fields.hours);
  const nameOk = fields.name.trim().length > 0;
  const dirty =
    fields.name.trim() !== track.name || fields.colour !== track.colour || minutes !== track.weeklyTargetMinutes;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNote(null);
    try {
      await work();
      setNote(done);
    } catch (error) {
      setNote(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (minutes === null || !nameOk || !dirty) return;
    void run(
      () => edit(track.id, { name: fields.name, colour: fields.colour, weeklyTargetMinutes: minutes }),
      'Saved.',
    );
  };

  return (
    <details className="ln-track" data-away={track.archived ? '' : undefined}>
      <summary>
        <span className="ln-track__dot" style={{ '--track-dot': `var(--track-${track.colour})` } as CSSProperties} />
        <span className="ln-track__name">{track.name}</span>
        <span className="ln-track__meta">{track.archived ? 'put away' : targetWords(track.weeklyTargetMinutes)}</span>
      </summary>
      <form className="ln-track__form" onSubmit={save} aria-label={`Edit ${track.name}`}>
        <TrackFields
          fields={fields}
          onChange={(next) => {
            setNote(null);
            setFields(next);
          }}
          nameError={nameOk ? undefined : 'A track needs a name.'}
          hoursError={minutes === null ? `Somewhere from 0 to ${MAX_HOURS} hours works.` : undefined}
        />
        <div className="ln-track__actions">
          <Button type="submit" variant="ember" disabled={busy || !dirty || !nameOk || minutes === null}>
            Save
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () => edit(track.id, { archived: !track.archived }),
                track.archived ? 'Back on the shelf.' : 'Put away. Its topics stay in Library.',
              )
            }
          >
            {track.archived ? 'Bring back' : 'Put away'}
          </Button>
        </div>
        {note && (
          <p className="ln-small ln-muted" role="status">
            {note}
          </p>
        )}
      </form>
    </details>
  );
}

function NewTrack({ colour }: { colour: TrackColour }) {
  const add = useLantern((s) => s.addTrack);
  const [fields, setFields] = useState<Fields>({ name: '', colour, hours: '2' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const minutes = hoursToMinutes(fields.hours);
  const ready = fields.name.trim().length > 0 && minutes !== null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || minutes === null) return;
    setBusy(true);
    setNote(null);
    try {
      await add({ name: fields.name, colour: fields.colour, weeklyTargetMinutes: minutes });
      // The form is keyed by the track count, so it is replaced by a fresh one.
    } catch (error) {
      setNote(messageFor(error));
      setBusy(false);
    }
  };

  return (
    <form className="ln-form" onSubmit={submit} aria-label="New track">
      <TrackFields
        fields={fields}
        onChange={(next) => {
          setNote(null);
          setFields(next);
        }}
        hoursError={minutes === null ? `Somewhere from 0 to ${MAX_HOURS} hours works.` : undefined}
      />
      <div className="ln-form__actions">
        <Button type="submit" variant="ember" block disabled={busy || !ready}>
          Add track
        </Button>
        {note && (
          <p className="ln-form__preview" role="status">
            {note}
          </p>
        )}
      </div>
    </form>
  );
}
