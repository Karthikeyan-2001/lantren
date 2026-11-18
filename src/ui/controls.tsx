import { useId } from 'react';
import type { ButtonHTMLAttributes, ComponentProps, CSSProperties, ReactNode } from 'react';

import { Flame, type FlameState } from './Flame';
import { Hearth } from './Hearth';

/* ---------- Button ---------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ember' | 'quiet' | 'ghost';
  block?: boolean;
}

export function Button({ variant = 'quiet', block, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`ln-btn ln-btn--${variant}${block ? ' ln-btn--block' : ''} ${className}`.trim()}
      {...rest}
    />
  );
}

/* ---------- Pill ---------- */

export function Pill({ colour, children }: { colour?: string; children: ReactNode }) {
  return (
    <span className="ln-pill" style={{ '--pill-colour': colour } as CSSProperties}>
      {colour && <span className="ln-pill__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ---------- Fields ---------- */

interface FieldBase {
  label: string;
  hint?: string;
  /** A gentle note when the value needs another look. Shown in place of the hint. */
  error?: string;
}

function FieldNote({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  if (!hint && !error) return null;
  return (
    <span id={`${id}-hint`} className="ln-field__hint" data-tone={error ? 'note' : undefined}>
      {error ?? hint}
    </span>
  );
}

/** `ref` passes through to the input (React 19 forwards it as a prop). */
export function TextField({ label, hint, error, ...rest }: FieldBase & ComponentProps<'input'>) {
  const id = useId();
  return (
    <div className="ln-field">
      <label className="ln-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ln-field__control"
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <FieldNote id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextArea({ label, hint, error, ...rest }: FieldBase & ComponentProps<'textarea'>) {
  const id = useId();
  return (
    <div className="ln-field">
      <label className="ln-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="ln-field__control"
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <FieldNote id={id} hint={hint} error={error} />
    </div>
  );
}

/** A native picker for one of many, styled as a field. Pass `<option>`s as children. */
export function SelectField({ label, hint, error, children, ...rest }: FieldBase & ComponentProps<'select'>) {
  const id = useId();
  return (
    <div className="ln-field">
      <label className="ln-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="ln-field__control"
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </select>
      <FieldNote id={id} hint={hint} error={error} />
    </div>
  );
}

/** A slider. `valueText` is what a screen reader hears, for example "60 percent". */
export function RangeField({
  label,
  hint,
  valueText,
  ...rest
}: Omit<FieldBase, 'error'> & { valueText?: string } & ComponentProps<'input'>) {
  const id = useId();
  return (
    <div className="ln-field">
      <label className="ln-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="ln-range"
        aria-valuetext={valueText}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
      <FieldNote id={id} hint={hint} />
    </div>
  );
}

/* ---------- Choice pills ---------- */

interface ChoiceProps<T extends string> {
  legend: string;
  options: readonly { value: T; label: string; colour?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  /** A short line under the legend, for example what the ends of a scale mean. */
  hint?: string;
  /** Pills size to their labels instead of sharing the row; for long labels. */
  fit?: boolean;
}

/** Short, fixed sets read best as one segmented track; anything longer or coloured as chips. */
const SEGMENT_MAX_OPTIONS = 5;
const SEGMENT_MAX_LABEL = 9;
const isSegmented = (options: readonly { label: string; colour?: string }[]): boolean =>
  options.length <= SEGMENT_MAX_OPTIONS && options.every((o) => !o.colour && o.label.length <= SEGMENT_MAX_LABEL);

/**
 * A radio group. Short fixed sets (length, theme, confidence) are drawn as a segmented track
 * with a thumb that glides to the chosen option; longer or coloured sets as chips that wrap.
 * Arrow keys move between options, as with any radio group.
 */
export function Choice<T extends string>({ legend, options, value, onChange, hint, fit }: ChoiceProps<T>) {
  const name = useId();
  const segmented = !fit && isSegmented(options);
  const index = options.findIndex((o) => o.value === value);
  const kind = segmented ? 'ln-choice--segmented' : 'ln-choice--chips';
  return (
    <fieldset className={`ln-choice ${kind}`} aria-describedby={hint ? `${name}-hint` : undefined}>
      <legend>{legend}</legend>
      {hint && (
        <p id={`${name}-hint`} className="ln-choice__hint">
          {hint}
        </p>
      )}
      <div
        className="ln-choice__row"
        style={segmented ? ({ '--count': options.length, '--index': Math.max(index, 0) } as CSSProperties) : undefined}
      >
        {segmented && <span className="ln-choice__thumb" data-on={index >= 0 || undefined} aria-hidden="true" />}
        {options.map((option) => (
          <label key={option.value} className="ln-choice__item">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span style={{ '--choice-colour': option.colour } as CSSProperties}>
              {option.colour && <i className="ln-choice__dot" aria-hidden="true" />}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------- Progress ring ---------- */

interface RingProps {
  value: number;
  max: number;
  size?: number;
  colour?: string;
  /** Read out by screen readers, for example "javascript deep dive: 90 of 180 minutes". */
  label: string;
  children?: ReactNode;
}

export function ProgressRing({ value, max, size = 88, colour, label, children }: RingProps) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      className="ln-ring"
      style={{ width: size, height: size, '--ring-colour': colour } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} aria-hidden="true" focusable="false">
        <circle className="ln-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ln-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="ln-ring__label" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ln-arch">
      <div className="ln-empty">
        <Hearth mood="ready" mini />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/* ---------- Notice ---------- */

/** A quiet confirmation line, read out politely by screen readers. */
export function Notice({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="ln-notice" role="status">
      <Flame state="lit" size={18} />
      <p>{children}</p>
      {onDismiss && (
        <Button variant="ghost" onClick={onDismiss}>
          Okay
        </Button>
      )}
    </div>
  );
}

/* ---------- Offer ---------- */

/**
 * A one-time, optional suggestion with a yes and a "not now". Unlike a Notice it is not
 * announced on arrival; it waits in the page like any other section.
 */
export function Offer({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <section className="ln-offer" aria-label={title}>
      <Flame state="waiting" size={22} />
      <div className="ln-offer__body">
        <p className="ln-offer__title">{title}</p>
        <p className="ln-offer__text">{children}</p>
        <div className="ln-offer__actions">{actions}</div>
      </div>
    </section>
  );
}

/* ---------- Recall rating ---------- */

export type RecallValue = 'forgot' | 'fuzzy' | 'solid';

const RECALL_OPTIONS: readonly { value: RecallValue; label: string; hint: string }[] = [
  { value: 'forgot', label: 'Forgot', hint: 'It slipped away. One more look tomorrow.' },
  { value: 'fuzzy', label: 'Fuzzy', hint: 'Parts came back, with gaps.' },
  { value: 'solid', label: 'Solid', hint: 'It came back whole.' },
];

/** How much light each answer leaves: none, a flicker, a full flame. */
const RECALL_FLAME: Record<RecallValue, FlameState> = { forgot: 'unlit', fuzzy: 'waiting', solid: 'lit' };

/**
 * Three honest answers, stacked. Each is a real button: one tap records it. Forgot is
 * drawn as calmly as the others; only Solid carries a little warmth.
 */
export function RecallRating({
  onRate,
  disabled,
  labelledBy,
}: {
  onRate: (value: RecallValue) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  return (
    <div className="ln-rating" role="group" aria-labelledby={labelledBy}>
      {RECALL_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className="ln-rating__option"
          data-recall={o.value}
          disabled={disabled}
          onClick={() => onRate(o.value)}
        >
          <Flame state={RECALL_FLAME[o.value]} size={22} />
          <span className="ln-rating__words">
            <span className="ln-rating__label">{o.label}</span>
            <span className="ln-rating__hint">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Toggle ---------- */

/** An on/off setting: a checkbox drawn as a small lantern switch, announced as a switch. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="ln-toggle">
      <label className="ln-toggle__text" htmlFor={id}>
        <span className="ln-toggle__label">{label}</span>
        {hint && (
          <span id={`${id}-hint`} className="ln-toggle__hint">
            {hint}
          </span>
        )}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ln-toggle__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

/* ---------- Flame scale ---------- */

const SCALE_WORDS = ['shaky', 'unsure', 'getting there', 'solid', 'could teach it'] as const;

/**
 * Five flames for "how sure do you feel?": tapping one lights it and every flame before it.
 * A radio group underneath, so arrow keys and screen readers work as with any choice.
 */
export function FlameScale<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  /** Exactly the scale's steps, lowest first. */
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  const chosen = options.findIndex((o) => o.value === value);
  return (
    <fieldset className="ln-choice ln-scale">
      <legend>{legend}</legend>
      <div className="ln-scale__row">
        {options.map((option, i) => (
          <label key={option.value} className="ln-scale__item" data-on={i <= chosen || undefined}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-label={`${option.label}, ${SCALE_WORDS[i] ?? ''}`}
            />
            <Flame state={i <= chosen ? 'lit' : 'unlit'} size={24} />
            <span className="ln-scale__num" aria-hidden="true">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      <p className="ln-scale__word" aria-hidden="true">
        {SCALE_WORDS[chosen] ?? ''}
      </p>
    </fieldset>
  );
}

/* ---------- Steps ---------- */

/** Where you are in a short flow: a row of small flames joined by a thread, the current one lit. */
export function Steps({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="ln-steps" aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((step, i) => (
        <li
          key={step}
          className="ln-steps__step"
          data-state={i < current ? 'done' : i === current ? 'now' : 'later'}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="ln-steps__dot" aria-hidden="true" />
          <span className="ln-steps__label">{step}</span>
        </li>
      ))}
    </ol>
  );
}
