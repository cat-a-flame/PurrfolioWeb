'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Checkbox from './Checkbox';
import FilterChip from './FilterChip';
import styles from './FilterDropdown.module.css';

const MARGIN = 8;

interface FilterDropdownProps {
  label: string;
  /** How many values are picked; shown on the chip. */
  count?: number;
  /** Panel width in px. */
  width?: number;
  /** Rendered above the scrolling list, e.g. a search field. */
  header?: ReactNode;
  footer?: (close: () => void) => ReactNode;
  children: ReactNode;
  /** Called after the panel closes, e.g. to clear its search. */
  onClose?: () => void;
}

/** A filter chip that opens a panel of options below it. */
export default function FilterDropdown({ label, count = 0, width = 280, header, footer, children, onClose }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  function close(refocus = false) {
    setOpen(false);
    onClose?.();
    if (refocus) chipRef.current?.focus();
  }

  // Portaled so the page's stacking and overflow can't clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = chipRef.current?.getBoundingClientRect();
      if (!rect) return;
      const w = Math.min(width, window.innerWidth - MARGIN * 2);
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - w - MARGIN));
      const top = rect.bottom + MARGIN;
      setPos({ top, left, maxHeight: Math.max(220, window.innerHeight - top - MARGIN * 2) });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (chipRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus the search field if there is one, otherwise the first option.
  useEffect(() => {
    if (!open || !pos) return;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, [data-filter-option]');
    first?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!pos]);

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-filter-option]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = current === -1
      ? (e.key === 'ArrowDown' ? 0 : items.length - 1)
      : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  return (
    <>
      <FilterChip
        ref={chipRef}
        label={label}
        count={count}
        open={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={e => {
          if (!open && e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
        }}
      />
      {open && pos && createPortal(
        <div
          id={panelId}
          ref={panelRef}
          className={styles.panel}
          style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - MARGIN * 2), maxHeight: pos.maxHeight }}
          role="group"
          aria-label={`${label} filter`}
          onKeyDown={onPanelKeyDown}
        >
          {header && <div className={styles.header}>{header}</div>}
          <div className={styles.list}>{children}</div>
          {footer && <div className={styles.footer}>{footer(() => close(true))}</div>}
        </div>,
        document.body
      )}
    </>
  );
}

interface FilterOptionProps {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Shown on the right, e.g. a currency or a count. */
  meta?: ReactNode;
  /** Shown left of the checkbox, e.g. an expand toggle. */
  leading?: ReactNode;
  /** Nesting depth; each level indents the row. */
  depth?: number;
  /** Styles the row as a group heading (small caps). */
  heading?: boolean;
}

/** One checkable row inside a FilterDropdown. */
export function FilterOption({ checked, indeterminate = false, onToggle, children, meta, leading, depth = 0, heading = false }: FilterOptionProps) {
  return (
    <div className={styles.row} style={depth ? { paddingLeft: `calc(var(--space-2) + ${depth * 28}px)` } : undefined}>
      {leading}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked ? true : indeterminate ? 'mixed' : false}
        className={[styles.option, heading ? styles.optionHeading : ''].filter(Boolean).join(' ')}
        onClick={onToggle}
        data-filter-option
      >
        <Checkbox checked={checked} indeterminate={indeterminate} />
        <span className={styles.optionLabel}>{children}</span>
        {meta != null && <span className={styles.optionMeta}>{meta}</span>}
      </button>
    </div>
  );
}

export function FilterEmpty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function FilterDot({ color }: { color: string }) {
  return <span className={styles.dot} style={{ backgroundColor: color }} />;
}
