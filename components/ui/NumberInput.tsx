'use client';

import { useRef } from 'react';
import { Input as ChakraInput } from '@chakra-ui/react';

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
    const nonSpaceCount = nonSpacesBefore(displayed, cursor);
    const raw = stripNonNumeric(displayed);
    onChange(raw);
    const formatted = addSpaces(raw);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newCursor = cursorAfterNonSpaces(formatted, nonSpaceCount);
      inputRef.current.selectionStart = newCursor;
      inputRef.current.selectionEnd = newCursor;
    });
  }

  return (
    <ChakraInput
      ref={inputRef}
      {...(rest as any)}
      type="text"
      inputMode="decimal"
      bg="var(--color-surface)"
      color="var(--color-text)"
      borderColor="var(--color-border)"
      borderRadius="var(--radius-md)"
      height="42px"
      fontSize="0.9375rem"
      fontFamily="var(--font-figtree)"
      _placeholder={{ color: 'var(--color-text-faint)' }}
      _hover={{ borderColor: 'var(--color-text-muted)' }}
      _focus={{ borderColor: 'var(--color-border-focus)', boxShadow: '0 0 0 3px var(--color-accent-glow)', outline: 'none' }}
      className={className}
      value={addSpaces(value)}
      onChange={handleChange}
    />
  );
}
