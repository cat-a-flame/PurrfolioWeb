'use client';

import { useState } from 'react';
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
  // Keep digits, at most one decimal point, and a leading minus
  const cleaned = val.replace(/[^\d.-]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
  return cleaned;
}

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string;
  onChange: (raw: string) => void;
}

export default function NumberInput({ value, onChange, className, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <div className={styles.wrapper}>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        className={[styles.input, className ?? ''].filter(Boolean).join(' ')}
        value={focused ? value : addSpaces(value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={e => onChange(stripNonNumeric(e.target.value))}
      />
    </div>
  );
}
