'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './AnimatedValue.module.css';

interface Props {
  value: number;
  format: (n: number) => string;
}

export default function AnimatedValue({ value, format }: Props) {
  const prevRef = useRef(value);
  const [current, setCurrent] = useState(value);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [dir, setDir] = useState<'up' | 'down'>('up');

  useEffect(() => {
    if (value === prevRef.current) return;
    setDir(value >= prevRef.current ? 'up' : 'down');
    setOutgoing(prevRef.current);
    setCurrent(value);
    prevRef.current = value;
    const t = setTimeout(() => setOutgoing(null), 320);
    return () => clearTimeout(t);
  }, [value]);

  const exitClass  = dir === 'up' ? styles.exitUp   : styles.exitDown;
  const enterClass = dir === 'up' ? styles.enterUp  : styles.enterDown;

  return (
    <span className={styles.wrapper}>
      {outgoing !== null && (
        <span className={[styles.item, exitClass].join(' ')} aria-hidden="true">
          {format(outgoing)}
        </span>
      )}
      <span className={[styles.item, outgoing !== null ? enterClass : ''].filter(Boolean).join(' ')}>
        {format(current)}
      </span>
    </span>
  );
}
