'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './AnimatedValue.module.css';

interface CharInfo {
  key: string;        // position-from-right, stable across length changes
  curr: string;       // character to display
  prev: string | null; // non-null while animating out
  dir: 'up' | 'down';
  isDigit: boolean;
}

/**
 * Aligns two formatted strings from the right so that the ones digit,
 * tens digit, etc. always compare against each other — even when the
 * number of digits (and therefore separators) changes.
 */
function buildChars(currStr: string, prevStr: string | null): CharInfo[] {
  return currStr.split('').map((c, i) => {
    const posFromRight = currStr.length - 1 - i;
    const prevIdx = prevStr !== null ? prevStr.length - 1 - posFromRight : -1;
    const p = prevStr !== null && prevIdx >= 0 ? prevStr[prevIdx] : null;
    const isDigit = /\d/.test(c);

    // Only animate digit→digit transitions where the value actually changed
    if (!isDigit || p === null || !/\d/.test(p) || c === p) {
      return { key: `r${posFromRight}`, curr: c, prev: null, dir: 'up' as const, isDigit };
    }

    return {
      key: `r${posFromRight}`,
      curr: c,
      prev: p,
      dir: parseInt(c) > parseInt(p) ? 'up' : 'down',
      isDigit: true,
    };
  });
}

interface Props {
  value: number;
  format: (n: number) => string;
}

export default function AnimatedValue({ value, format }: Props) {
  // Start from "0" so the first effect run animates up to the real value
  const prevStrRef = useRef<string>(format(0));
  const [chars, setChars] = useState<CharInfo[]>(() => buildChars(format(0), null));

  useEffect(() => {
    const newStr = format(value);
    if (newStr === prevStrRef.current) return;
    const prevStr = prevStrRef.current;
    prevStrRef.current = newStr;
    setChars(buildChars(newStr, prevStr));
    const t = setTimeout(() => setChars(cs => cs.map(c => ({ ...c, prev: null }))), 380);
    return () => clearTimeout(t);
  }, [value, format]);

  return (
    <span className={styles.wrapper}>
      {chars.map(info =>
        info.isDigit && info.prev !== null ? (
          <span key={info.key} className={styles.slot}>
            <span className={`${styles.item} ${info.dir === 'up' ? styles.exitUp : styles.exitDown}`} aria-hidden="true">
              {info.prev}
            </span>
            <span className={`${styles.item} ${info.dir === 'up' ? styles.enterUp : styles.enterDown}`}>
              {info.curr}
            </span>
          </span>
        ) : (
          <span key={info.key}>{info.curr}</span>
        )
      )}
    </span>
  );
}
