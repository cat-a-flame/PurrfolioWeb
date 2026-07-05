'use client';

import { useEffect } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}

export default function Dialog({ title, subtitle, icon, onClose, children, maxWidth }: DialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.panel}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className={[styles.header, icon ? styles.headerWithIcon : ''].filter(Boolean).join(' ')}>
          {icon ? <div className={styles.headerIcon}>{icon}</div> : null}
          <div className={styles.headerText}>
            <h2 id="dialog-title" className={styles.title}>{title}</h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
