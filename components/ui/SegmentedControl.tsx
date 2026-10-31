'use client';

import { useRef } from 'react';
import styles from './SegmentedControl.module.css';

export type SegmentedTone = 'expense' | 'income' | 'accent';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Colour of the option when selected. Defaults to accent (anything without money meaning). */
  tone?: SegmentedTone;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** md: dialogs and forms. sm: toolbars and filters. */
  size?: 'md' | 'sm';
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

/**
 * Picks one option from two to four; exactly one is always selected.
 * A radio group: one Tab stop on the selected option, arrow keys move and select.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
  className,
  ...rest
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, step: 1 | -1) {
    const n = options.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + step * i + n * i) % n;
      if (!options[idx].disabled) {
        onChange(options[idx].value);
        refs.current[idx]?.focus();
        return;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(idx, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(idx, -1); }
  }

  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      aria-disabled={disabled || undefined}
      className={[styles.track, styles[size], disabled ? styles.disabled : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={el => { refs.current[idx] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || opt.disabled}
            className={[styles.option, selected ? styles.selected : '', styles[opt.tone ?? 'accent']].filter(Boolean).join(' ')}
            onClick={() => onChange(opt.value)}
            onKeyDown={e => onKeyDown(e, idx)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
