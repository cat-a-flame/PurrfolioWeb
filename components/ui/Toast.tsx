'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true);
    }, duration - 300);

    const cleanup = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => {
      clearTimeout(timer);
      clearTimeout(cleanup);
    };
  }, [duration, onDismiss]);

  return (
    <div
      className={[
        styles.toast,
        styles[variant],
        leaving ? styles.leaving : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="alert"
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
