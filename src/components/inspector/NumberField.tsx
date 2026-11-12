'use client';

import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface NumberFieldProps {
  label: string;
  /** Committed value. `null` shows an empty field with the placeholder. */
  value: number | null;
  /** Called once per edit, on Enter, blur, or an arrow-key step. */
  onCommit: (value: number) => void;
  /** Arrow-key step. Shift multiplies it by 10. Defaults to 1. */
  step?: number;
  min?: number;
  max?: number;
  /** Decimal places shown and kept. Defaults to 2. */
  precision?: number;
  /** Short unit shown after the input, such as "px" or "s". */
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
}

const roundTo = (value: number, precision: number) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

/**
 * Labelled numeric input that edits a draft and commits it as one change.
 *
 * Typing never touches the store. Enter or blur commits the draft, Escape
 * discards it, and Up/Down step the value (Shift for ten steps) and commit
 * immediately. Unparseable drafts are discarded.
 */
const NumberField = ({
  label,
  value,
  onCommit,
  step = 1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  precision = 2,
  unit,
  placeholder,
  disabled,
  title,
}: NumberFieldProps) => {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? '' : String(roundTo(value, precision));

  const normalise = (next: number) =>
    roundTo(Math.max(min, Math.min(max, next)), precision);

  const commit = () => {
    if (draft === null) {
      return;
    }

    const text = draft.trim().replace(',', '.');
    const parsed = text === '' ? Number.NaN : Number(text);
    setDraft(null);

    if (!Number.isFinite(parsed)) {
      return;
    }

    const next = normalise(parsed);

    if (value === null || next !== roundTo(value, precision)) {
      onCommit(next);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }

    if (event.key === 'Escape') {
      setDraft(null);
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();

      const parsed = draft === null ? Number.NaN : Number(draft.trim().replace(',', '.'));
      const base = Number.isFinite(parsed) ? parsed : value ?? 0;
      const delta = (event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1);
      const next = normalise(base + delta);

      setDraft(null);

      if (value === null || next !== roundTo(value, precision)) {
        onCommit(next);
      }
    }
  };

  return (
    <div className="signal-field" title={title}>
      <label htmlFor={id}>{label}</label>
      <div className="signal-field__control">
        <input
          id={id}
          className="signal-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={draft ?? shown}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        {unit && <span className="signal-field__unit">{unit}</span>}
      </div>
    </div>
  );
};

export default NumberField;
