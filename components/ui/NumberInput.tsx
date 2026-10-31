'use client';

import { useRef, useState } from 'react';
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
  const parts = cleaned.split('.');
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
}

function nonSpacesBefore(str: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos && i < str.length; i++) {
    if (str[i] !== ' ') count++;
  }
  return count;
}

function cursorAfterNonSpaces(formatted: string, nonSpaces: number): number {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (count === nonSpaces) return i;
    if (formatted[i] !== ' ') count++;
  }
  return formatted.length;
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'prefix'> {
  value: string;
  onChange: (raw: string) => void;
  /** Rendered inside the field, before the number (e.g. a sign) */
  prefix?: React.ReactNode;
  /** Rendered inside the field, after the number (e.g. a currency code) */
  suffix?: React.ReactNode;
}

export default function NumberInput({ value, onChange, className, placeholder, onFocus, onBlur, prefix, suffix, ...rest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const displayed = el.value;
    const cursor = el.selectionStart ?? displayed.length;

    const nonSpaceCount = nonSpacesBefore(displayed, cursor);

    const raw = stripNonNumeric(displayed);
    onChange(raw);

    const formatted = addSpaces(raw);

    // Keep the cursor after the same digit once spaces are re-added.
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newCursor = cursorAfterNonSpaces(formatted, nonSpaceCount);
      inputRef.current.selectionStart = newCursor;
      inputRef.current.selectionEnd = newCursor;
    });
  }

  const input = (
    <input
      ref={inputRef}
      {...rest}
      placeholder={focused ? undefined : placeholder}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      type="text"
      inputMode="decimal"
      className={[styles.input, prefix || suffix ? styles.inputBare : '', className ?? ''].filter(Boolean).join(' ')}
      value={addSpaces(value)}
      onChange={handleChange}
    />
  );

  if (!prefix && !suffix) {
    return <div className={styles.wrapper}>{input}</div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.adorned}>
        {prefix ? <span className={styles.adornment}>{prefix}</span> : null}
        {input}
        {suffix ? <span className={styles.adornment}>{suffix}</span> : null}
      </div>
    </div>
  );
}
