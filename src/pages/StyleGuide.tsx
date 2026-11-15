import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { contrastRatio, parseColour } from '../theme/contrast';
import { useTheme, type ThemeChoice } from '../theme/theme';
import { Flame } from '../ui/Flame';
import { Lantern } from '../ui/Lantern';
import { Screen } from '../ui/Screen';
import { Button, Choice, EmptyState, Pill, ProgressRing, TextArea, TextField } from '../ui/controls';

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
  const minutes = Math.round((remaining / 100) * 25);

  return (
    <Screen
      kicker="style guide"
      title="Lantern"
      lede="Studying is carrying a lantern through the dark. This page holds every piece the app is built from."
    >
      <Link to="/library" className="ln-btn ln-btn--ghost sg-back">
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
        <Choice legend="How well did it come back?" options={RECALL} value={recall} onChange={setRecall} />
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

      <Section title="Focus timer" note="The flame dims as the session runs down. Drag to see it.">
        <div className="ln-timer">
          <Flame state="lit" size={72} level={remaining / 100} />
          <span className="ln-timer__digits" aria-hidden="true">
            {String(minutes).padStart(2, '0')}:00
          </span>
        </div>
        <label className="ln-field">
          <span className="ln-field__label">Time remaining: {minutes} of 25 minutes</span>
          <input
            className="ln-range"
            type="range"
            min={0}
            max={100}
            value={remaining}
            onChange={(e) => setRemaining(Number(e.target.value))}
          />
        </label>
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
