'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Toast.module.css';

export type ToastVariant = 'success' | 'error';

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({
  message,
  variant = 'success',
  duration = 4000,
  onDismiss,
}: ToastProps) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Hovering or focusing the toast pauses the countdown; leaving resumes with the time that was left.
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => setLeaving(true), Math.max(remaining.current - 300, 0));
    const cleanup = setTimeout(() => onDismissRef.current(), remaining.current);

    return () => {
      clearTimeout(timer);
      clearTimeout(cleanup);
      remaining.current = Math.max(remaining.current - (Date.now() - startedAt), 0);
    };
  }, [paused]);

  return (
    <div
      className={[
        styles.toast,
        styles[variant],
        leaving ? styles.leaving : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.message}>{message}</span>
      <button
        className={styles.close}
        onClick={() => {
          setLeaving(true);
          setTimeout(onDismiss, 300);
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
