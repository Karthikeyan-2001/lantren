import { useId } from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

import { Flame } from './Flame';

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
}

export function TextField({ label, hint, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="ln-field">
      <label className="ln-field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="ln-field__control" aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint && (
        <span id={`${id}-hint`} className="ln-field__hint">
          {hint}
        </span>
      )}
    </div>
  );
}

export function TextArea({ label, hint, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="ln-field">
      <label className="ln-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="ln-field__control" aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint && (
        <span id={`${id}-hint`} className="ln-field__hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/* ---------- Choice pills ---------- */

interface ChoiceProps<T extends string> {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}

/** A radio group drawn as pills. Arrow keys move between options, as with any radio group. */
export function Choice<T extends string>({ legend, options, value, onChange }: ChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className="ln-choice">
      <legend>{legend}</legend>
      <div className="ln-choice__row">
        {options.map((option) => (
          <label key={option.value} className="ln-choice__item">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
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
        <Flame state="waiting" size={34} />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
