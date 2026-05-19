'use client';

import { useRef } from 'react';
import styles from './Input.module.css';

function addSpaces(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const abs = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = abs.split('.');
  const spaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = decPart !== undefined ? `${spaced}.${decPart}` : spaced;
  return negative ? `-${formatted}` : formatted;
}

function stripNonNumeric(val: string): string {
  const cleaned = val.replace(/[^\d.-]/g, '');
  // At most one decimal point
  const parts = cleaned.split('.');
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
}

// Given a position in the displayed (spaced) string, return how many
// non-space characters appear before that position.
function nonSpacesBefore(str: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos && i < str.length; i++) {
    if (str[i] !== ' ') count++;
  }
  return count;
}

// Given the formatted string and a number of non-space chars that should
// precede the cursor, return the cursor index in the formatted string.
function cursorAfterNonSpaces(formatted: string, nonSpaces: number): number {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (count === nonSpaces) return i;
    if (formatted[i] !== ' ') count++;
  }
  return formatted.length;
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string;
  onChange: (raw: string) => void;
}

export default function NumberInput({ value, onChange, className, ...rest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const displayed = el.value;
    const cursor = el.selectionStart ?? displayed.length;

    // How many real (non-space) chars were before the cursor
    const nonSpaceCount = nonSpacesBefore(displayed, cursor);

    const raw = stripNonNumeric(displayed);
    onChange(raw);

    const formatted = addSpaces(raw);

    // Restore cursor at the equivalent position in the new formatted string
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newCursor = cursorAfterNonSpaces(formatted, nonSpaceCount);
      inputRef.current.selectionStart = newCursor;
      inputRef.current.selectionEnd = newCursor;
    });
  }

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        {...rest}
        type="text"
        inputMode="decimal"
        className={[styles.input, className ?? ''].filter(Boolean).join(' ')}
        value={addSpaces(value)}
        onChange={handleChange}
      />
    </div>
  );
}
