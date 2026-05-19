'use client';

import { useState, useRef, useEffect } from 'react';
import type { Label } from '@/lib/types';
import styles from './LabelSelect.module.css';

interface LabelSelectProps {
  labels: Label[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function LabelSelect({ labels, selectedIds, onChange }: LabelSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(s => s !== id)
        : [...selectedIds, id]
    );
  }

  const selected = labels.filter(l => selectedIds.includes(l.id));

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={[styles.trigger, open ? styles.triggerOpen : ''].filter(Boolean).join(' ')}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected.length === 0 ? (
          <span className={styles.placeholder}>Choose labels…</span>
        ) : (
          <span className={styles.chips}>
            {selected.map(l => (
              <span key={l.id} className={styles.chip}>
                <span className={styles.dot} style={{ backgroundColor: l.color }} />
                {l.name}
              </span>
            ))}
          </span>
        )}
        <span className={styles.chevron} aria-hidden>▾</span>
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-multiselectable="true">
          {labels.map(label => {
            const checked = selectedIds.includes(label.id);
            return (
              <button
                key={label.id}
                type="button"
                role="option"
                aria-selected={checked}
                className={[styles.option, checked ? styles.optionChecked : ''].filter(Boolean).join(' ')}
                onClick={() => toggle(label.id)}
              >
                <span className={styles.checkbox} aria-hidden>
                  {checked ? '✓' : ''}
                </span>
                <span className={styles.dot} style={{ backgroundColor: label.color }} />
                {label.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
