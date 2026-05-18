'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './SearchableSelect.module.css';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Choose',
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Group the filtered options
  const groups: { group: string | undefined; items: SelectOption[] }[] = [];
  for (const opt of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.group === opt.group) {
      last.items.push(opt);
    } else {
      groups.push({ group: opt.group, items: [opt] });
    }
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(val: string) {
    onChange(val);
    setOpen(false);
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        id={id}
        type="button"
        className={[styles.trigger, open ? styles.triggerOpen : ''].filter(Boolean).join(' ')}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? styles.triggerValue : styles.triggerPlaceholder}>
          {selected ? selected.label : placeholder}
        </span>
        <span className={styles.chevron} aria-hidden>▾</span>
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox">
          <div className={styles.searchWrap}>
            <input
              ref={inputRef}
              className={styles.search}
              type="text"
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.list}>
            {filtered.length === 0 ? (
              <p className={styles.empty}>No results</p>
            ) : (
              groups.map(({ group, items }) => (
                <div key={group ?? '__nogroup'}>
                  {group && <p className={styles.groupLabel}>{group}</p>}
                  {items.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={opt.value === value}
                      className={[
                        styles.option,
                        opt.value === value ? styles.optionSelected : '',
                        group ? styles.optionIndented : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => select(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
