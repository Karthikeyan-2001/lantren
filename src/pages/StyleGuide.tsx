import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { heatmap } from '../progress/stats';
import { addDays, startOfWeek, toLocalDate } from '../scheduler';
import { contrastRatio, parseColour } from '../theme/contrast';
import { useTheme, type ThemeChoice } from '../theme/theme';
import { Flame } from '../ui/Flame';
import { Hearth } from '../ui/Hearth';
import { Lantern } from '../ui/Lantern';
import { Heatmap, Meter, Stat, WeekCard } from '../ui/Progress';
import { Screen } from '../ui/Screen';
import { TopicRow } from '../ui/TopicRow';
import {
  Button,
  Choice,
  EmptyState,
  Notice,
  Offer,
  Pill,
  ProgressRing,
  RangeField,
  RecallRating,
  SelectField,
  TextArea,
  TextField,
  Toggle,
} from '../ui/controls';

import './StyleGuide.css';

const RAW = ['ink', 'soot', 'parchment', 'ember', 'moss', 'dusk', 'ash'] as const;
const TEXT_ROLES = ['text', 'text-muted', 'accent-text', 'moss-text', 'dusk-text'] as const;
const SURFACES = ['bg', 'surface', 'surface-2'] as const;
const TRACKS = [
  ['JavaScript deep dive', 'wheat'],
  ['DSA in JavaScript', 'ember'],
  ['LLM and RAG engineering', 'moss'],
  ['Agents and evaluation', 'dusk'],
  ['System design', 'lichen'],
  ['React and Ionic', 'clay'],
] as const;

/** Twelve sample weeks of study days, in a pattern that is the same every time. */
const SAMPLE_HEAT = (() => {
  const today = toLocalDate(new Date());
  const start = addDays(startOfWeek(today), -77);
  const activity = new Map<ReturnType<typeof toLocalDate>, number>();
  for (let i = 0; i < 84; i++) {
    const n = (i * 5 + Math.floor(i / 7) * 3) % 7;
    if (n < 4) activity.set(addDays(start, i), n === 3 ? 3 : n === 2 ? 2 : 1);
  }
  return heatmap(activity, today);
})();

const THEMES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'paper', label: 'Paper' },
  { value: 'system', label: 'System' },
];
const RECALL = [
  { value: 'forgot', label: 'Forgot' },
  { value: 'fuzzy', label: 'Fuzzy' },
  { value: 'solid', label: 'Solid' },
] as const;

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ln-section">
      <hr className="ln-rule" />
      <div>
        <h2>{title}</h2>
        {note && <p className="ln-muted ln-small">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** Reads the live CSS variables so the page always shows what is really on screen. */
function useTokens(names: readonly string[], theme: string) {
  // The theme attribute is set on <html> before the theme state changes, so this reads fresh values.
  return useMemo(() => {
    void theme;
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim()]));
  }, [names, theme]);
}

function ContrastTable({ theme }: { theme: string }) {
  const tokens = useTokens(ALL_ROLES, theme);
  const ratio = (fg: string, bg: string) => {
    const a = parseColour(tokens[fg] ?? '');
    const b = parseColour(tokens[bg] ?? '');
    return a && b ? contrastRatio(a, b) : null;
  };
  return (
    <table className="sg-table">
      <caption className="ln-sr">Contrast ratio of each text role on each surface</caption>
      <thead>
        <tr>
          <th scope="col">text role</th>
          {SURFACES.map((s) => (
            <th key={s} scope="col">
              {s}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {TEXT_ROLES.map((role) => (
          <tr key={role}>
            <th scope="row" style={{ color: `var(--${role})` }}>
              {role}
            </th>
            {SURFACES.map((s) => {
              const r = ratio(role, s);
              return (
                <td key={s} className="ln-mono">
                  {r ? `${r.toFixed(1)}${r >= 4.5 ? '' : ' low'}` : '-'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const ALL_ROLES = [...TEXT_ROLES, ...SURFACES];

export function StyleGuidePage() {
  const { choice, resolved, setChoice } = useTheme();
  const [recall, setRecall] = useState<(typeof RECALL)[number]['value'] | null>('fuzzy');
  const [remaining, setRemaining] = useState(70);
  const [rated, setRated] = useState<string>('nothing yet');
  const [toggled, setToggled] = useState(false);
  const [time, setTime] = useState('19:30');
  const [volume, setVolume] = useState(60);
  const minutes = Math.round((remaining / 100) * 25);

  return (
    <Screen
      kicker="style guide"
      title="Lantern"
      lede="Studying is carrying a lantern through the dark. This page holds every piece the app is built from."
    >
      <Link to="/library" className="ln-btn ln-btn--ghost ln-back">
        ← Library
      </Link>

      <Section title="Theme" note="Dark first. Paper is the daylight version.">
        <Choice legend="Appearance" options={THEMES} value={choice} onChange={setChoice} />
      </Section>

      <Section title="Palette" note="Seven colours. Ember is for the one thing that matters on a screen.">
        <ul className="sg-swatches">
          {RAW.map((name) => (
            <li key={name}>
              <span className="sg-swatch" style={{ background: `var(--${name})` }} />
              <span>{name}</span>
            </li>
          ))}
        </ul>
        <ContrastTable theme={resolved} />
        <p className="ln-muted ln-small">Every pair is checked in the unit tests to be 4.5:1 or better.</p>
      </Section>

      <Section title="Type" note="Fraunces for headings, Source Sans 3 for reading, DM Mono for numbers.">
        <div className="sg-type">
          <p className="sg-display">A quiet desk lamp</p>
          <h1>Heading one, Fraunces</h1>
          <h2>Heading two, a little softer</h2>
          <h3>Heading three for cards</h3>
          <p>
            Body text is set in a humanist sans at seventeen pixels, with room between the lines so notes are easy to
            read late in the evening.
          </p>
          <p className="ln-muted ln-small">Small muted text for hints and timestamps.</p>
          <p className="ln-mono">25:00 · day 4 · 12 min · 3 of 5</p>
          <span className="ln-kicker">a kicker in mono</span>
        </div>
      </Section>

      <Section title="Flames" note="Each topic has two. They tell you where it stands without a single badge.">
        <ul className="sg-flames">
          {(
            [
              ['unlit', 'not set'],
              ['waiting', 'waiting for you'],
              ['lit', 'reviewed'],
              ['steady', 'locked in'],
            ] as const
          ).map(([state, word]) => (
            <li key={state}>
              <Flame state={state} size={36} />
              <span className="ln-small ln-muted">{word}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Lanterns" note="One topic, one window. The cap carries the track colour.">
        <div className="sg-row">
          <Lantern day4="waiting" day7="unlit" colour="var(--track-wheat)" />
          <Lantern day4="lit" day7="waiting" colour="var(--track-moss)" />
          <Lantern day4="steady" day7="steady" colour="var(--track-dusk)" />
        </div>
      </Section>

      <Section title="Tracks" note="Six starter tracks, each with a quiet colour.">
        <div className="sg-wrap">
          {TRACKS.map(([name, colour]) => (
            <Pill key={name} colour={`var(--track-${colour})`}>
              {name}
            </Pill>
          ))}
        </div>
      </Section>

      <Section title="Buttons" note="Pills, at least 44 pixels tall. One ember button per screen at most.">
        <div className="sg-wrap">
          <Button variant="ember">Save topic</Button>
          <Button variant="quiet">Snooze a day</Button>
          <Button variant="ghost">Not now</Button>
          <Button variant="quiet" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Fields">
        <TextField label="Topic" placeholder="closures and the event loop" />
        <TextArea
          label="What you studied"
          placeholder="a few lines, in your own words"
          hint="Kept only on this device."
        />
        <TextField label="Topic, left empty" error="A few words is enough, so you will know it again." />
        <Choice legend="How well did it come back?" options={RECALL} value={recall} onChange={setRecall} />
        <Choice
          legend="Track, with colour dots"
          options={TRACKS.slice(0, 3).map(([name, colour]) => ({
            value: name,
            label: name,
            colour: `var(--track-${colour})`,
          }))}
          value={TRACKS[0][0]}
          onChange={() => undefined}
        />
      </Section>

      <Section title="Topic rows" note="A compact lantern, a title, one quiet line. Used on Today and in Library.">
        <ul className="ln-rows">
          <TopicRow
            title="Closures and the event loop"
            flames={['waiting', 'unlit']}
            colour="var(--track-wheat)"
            trackName="JavaScript deep dive"
            meta="day 4"
          />
          <TopicRow
            title="Two sum, with a hash map"
            flames={['lit', 'waiting']}
            colour="var(--track-ember)"
            trackName="DSA in JavaScript"
            meta="day 7, since yesterday"
            to="/styleguide"
          />
          <TopicRow
            title="Chunking strategies for RAG"
            flames={['steady', 'steady']}
            colour="var(--track-moss)"
            meta="Concept · studied Mon 2 Nov · locked in"
          />
        </ul>
      </Section>

      <Section
        title="Recall rating"
        note="After the reveal. Three honest answers; Forgot is drawn as calmly as the rest."
      >
        <RecallRating onRate={setRated} />
        <p className="ln-small ln-muted">Last tapped: {rated}</p>
      </Section>

      <Section title="Toggle" note="For on/off settings. Announced as a switch.">
        <Toggle
          label="Graduation reviews"
          hint="After a topic locks in, look again on day 14 and day 30."
          checked={toggled}
          onChange={setToggled}
        />
      </Section>

      <Section title="Notice" note="A one-line confirmation. Polite to screen readers, gone when dismissed.">
        <Notice onDismiss={() => undefined}>“Closures” is lit. Back on Wed 18 Nov and Sat 21 Nov.</Notice>
      </Section>

      <Section title="Offer" note="A one-time suggestion with a yes and a not now. Asked once, never repeated.">
        <Offer
          title="Want a nudge on review days?"
          actions={
            <>
              <Button variant="ember">Turn on reminders</Button>
              <Button variant="ghost">Not now</Button>
            </>
          }
        >
          One quiet reminder in the evening when a review is due.
        </Offer>
      </Section>

      <Section title="Time field" note="The device’s own time picker, set in the number face.">
        <div className="ln-field__row">
          <TextField label="Remind me at" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <TextField label="Quiet until" type="time" defaultValue="07:00" />
        </div>
      </Section>

      <Section title="Progress" note="A ring that fills slowly. No streak fireworks.">
        <div className="sg-row">
          <ProgressRing
            value={95}
            max={180}
            colour="var(--track-wheat)"
            label="JavaScript deep dive: 95 of 180 minutes"
          >
            <span className="ln-mono">95</span>
            <br />
            <span className="ln-small ln-muted">of 180</span>
          </ProgressRing>
          <ProgressRing value={180} max={180} colour="var(--track-moss)" label="LLM and RAG: 180 of 180 minutes">
            <span className="ln-mono">180</span>
            <br />
            <span className="ln-small ln-muted">done</span>
          </ProgressRing>
          <ProgressRing value={0} max={120} colour="var(--track-dusk)" label="Agents and evaluation: 0 of 120 minutes">
            <span className="ln-mono">0</span>
            <br />
            <span className="ln-small ln-muted">of 120</span>
          </ProgressRing>
        </div>
      </Section>

      <Section
        title="Heatmap, meters and stats"
        note="A calm record. Days are lit or not; a meter stops at its target; nothing is ranked."
      >
        <Heatmap
          cells={SAMPLE_HEAT.cells}
          weeks={SAMPLE_HEAT.weeks}
          label="Sample: 41 study days in the last 12 weeks."
        />
        <div>
          <div className="ln-meter-row">
            <div className="ln-meter-row__head" aria-hidden="true">
              <span>JavaScript deep dive</span>
              <span className="ln-muted ln-mono">1 h 40 min of 3 h</span>
            </div>
            <Meter value={100} max={180} colour="var(--track-wheat)" label="JavaScript deep dive: 1 h 40 min of 3 h" />
          </div>
          <div className="ln-meter-row">
            <div className="ln-meter-row__head" aria-hidden="true">
              <span>System design</span>
              <span className="ln-muted ln-mono">2 h of 2 h</span>
            </div>
            <Meter value={150} max={120} colour="var(--track-clay)" label="System design: 2 h 30 min of 2 h" />
          </div>
        </div>
        <dl className="ln-stats">
          <Stat value="75%" label="Reviews done" note="6 of 8 reviews done in the last four weeks." />
          <Stat value={12} label="Locked in" note="topics are yours now." />
        </dl>
        <WeekCard
          to="/styleguide"
          minutes={150}
          targetMinutes={570}
          line="2 h 30 min of 9 h 30 min this week"
          centre={
            <>
              <span className="ln-mono">2.5</span>
              <br />
              <span className="ln-small ln-muted">h</span>
            </>
          }
        />
      </Section>

      <Section title="Select and slider" note="The device’s own picker and slider, for one of many and for how much.">
        <SelectField label="Link a topic" defaultValue="" hint="Optional.">
          <option value="">No topic</option>
          <option value="closures">Closures and the event loop</option>
          <option value="two-sum">Two sum, with a hash map</option>
        </SelectField>
        <RangeField
          label="Volume"
          min={0}
          max={100}
          step={5}
          value={volume}
          valueText={`${volume} percent`}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </Section>

      <Section
        title="Hearth"
        note="The focus screen’s one picture. The flame and the light on the glass dim together as a session runs down. Drag to see it."
      >
        <div className="ln-focus__preview">
          <Hearth mood="burning" level={remaining / 100} compact />
          <span className="ln-timer__digits" aria-hidden="true">
            {String(minutes).padStart(2, '0')}:00
          </span>
        </div>
        <RangeField
          label={`Time remaining: ${minutes} of 25 minutes`}
          min={0}
          max={100}
          value={remaining}
          onChange={(e) => setRemaining(Number(e.target.value))}
        />
        <ul className="sg-flames">
          {(
            [
              ['ready', 'ready'],
              ['held', 'paused'],
              ['resting', 'on a break'],
              ['glow', 'finished'],
            ] as const
          ).map(([mood, word]) => (
            <li key={mood}>
              <Hearth mood={mood} level={0.6} compact />
              <span className="ln-small ln-muted">{word}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Empty state" note="Warm, and it always says what to do next.">
        <EmptyState title="Nothing waiting tonight">
          <p>Rest, or capture something new. Either is a good evening.</p>
        </EmptyState>
      </Section>

      <Section title="Shape and motion">
        <div className="sg-row sg-shapes">
          <span className="sg-shape sg-shape--arch">arch</span>
          <span className="sg-shape sg-shape--pill">pill</span>
          <span className="sg-shape sg-shape--soft">soft</span>
        </div>
        <ul className="sg-list ln-small">
          <li>
            <span className="ln-mono">250ms</span> quick: presses, toggles
          </li>
          <li>
            <span className="ln-mono">400ms</span> calm: navigation, reveals
          </li>
          <li>
            <span className="ln-mono">600ms</span> slow: flames, theme, screens
          </li>
          <li>Reduced motion is honoured: flames hold still.</li>
        </ul>
      </Section>

      <Section title="Voice" note="Short and kind. Never guilt.">
        <ul className="sg-list">
          <li>
            Overdue reviews say <em>waiting for you</em>.
          </li>
          <li>
            A missed day says <em>welcome back</em>.
          </li>
          <li>
            A forgotten topic says <em>this one is leaky, let us look again tomorrow</em>.
          </li>
          <li>
            Finishing a session says <em>that was good work</em>.
          </li>
        </ul>
      </Section>
    </Screen>
  );
}
