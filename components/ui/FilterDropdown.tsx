'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown } from 'react-icons/fi';
import Checkbox from './Checkbox';
import styles from './FilterDropdown.module.css';

const MARGIN = 8;

interface FilterDropdownProps {
  /** Names the filter; shown in the control while nothing is picked. */
  placeholder: string;
  /** Labels of the picked values, in display order. */
  selectedLabels: string[];
  /** Minimum menu width in px; the menu is never narrower than the control. */
  minMenuWidth?: number;
  /** Rendered above the scrolling list, e.g. a search row. */
  header?: ReactNode;
  children: ReactNode;
  /** Called when the menu closes, e.g. to clear its search. */
  onClose?: () => void;
}

/** A multi-select that looks like the form selects: a control that opens a menu of checkable options. */
export default function FilterDropdown({ placeholder, selectedLabels, minMenuWidth = 240, header, children, onClose }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const controlRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function close(refocus = false) {
    setOpen(false);
    onClose?.();
    if (refocus) controlRef.current?.focus();
  }

  // Portaled so the page's stacking and overflow can't clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, minMenuWidth), window.innerWidth - MARGIN * 2);
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
      const top = rect.bottom + 4;
      setPos({ top, left, width, maxHeight: Math.max(160, Math.min(360, window.innerHeight - top - 16)) });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, minMenuWidth]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (controlRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus the search field if there is one, otherwise the first option.
  useEffect(() => {
    if (!open || !pos) return;
    menuRef.current?.querySelector<HTMLElement>('input, [data-filter-option]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!pos]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[data-filter-option]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = current === -1
      ? (e.key === 'ArrowDown' ? 0 : items.length - 1)
      : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  const valueText = selectedLabels.length === 0
    ? null
    : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels[0]} +${selectedLabels.length - 1}`;

  return (
    <div className={styles.wrapper}>
      <FilterControl
        ref={controlRef}
        open={open}
        placeholder={!valueText}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={e => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); }
        }}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-label={valueText ? `${placeholder}: ${selectedLabels.join(', ')}` : placeholder}
      >
        {valueText ?? placeholder}
      </FilterControl>

      {open && pos && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          className={styles.menu}
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          role="group"
          aria-label={`${placeholder} filter`}
          onKeyDown={onMenuKeyDown}
        >
          {header}
          <div className={styles.list}>{children}</div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface FilterControlProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  open: boolean;
  /** Shows the text in the placeholder colour. */
  placeholder?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/** The closed select: same look as the form selects. Also used by PeriodPicker's 'select' variant. */
export function FilterControl({ open, placeholder = false, icon, children, ref, ...props }: FilterControlProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={[styles.control, open ? styles.controlOpen : ''].filter(Boolean).join(' ')}
      aria-expanded={open}
      {...props}
    >
      {icon && <span className={styles.controlIcon}>{icon}</span>}
      <span className={placeholder ? styles.controlPlaceholder : styles.controlValue}>{children}</span>
      <FiChevronDown className={styles.chevron} />
    </button>
  );
}

interface FilterOptionProps {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Shown on the right, e.g. a currency. */
  meta?: ReactNode;
  /** Shown at the right edge, outside the toggle, e.g. a drill-in button. */
  trailing?: ReactNode;
  /** Indents the row under a group heading. */
  nested?: boolean;
}

/** One checkable row inside a FilterDropdown. */
export function FilterOption({ checked, indeterminate = false, onToggle, children, meta, trailing, nested = false }: FilterOptionProps) {
  return (
    <div className={[styles.row, checked ? styles.rowChecked : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked ? true : indeterminate ? 'mixed' : false}
        className={[styles.option, nested ? styles.optionNested : ''].filter(Boolean).join(' ')}
        onClick={onToggle}
        data-filter-option
      >
        <Checkbox checked={checked} indeterminate={indeterminate} />
        <span className={styles.optionLabel}>{children}</span>
        {meta != null && <span className={styles.optionMeta}>{meta}</span>}
      </button>
      {trailing}
    </div>
  );
}

/** A group heading that checks every option under it, styled like the form selects' group headings. */
export function FilterGroupHeading({ checked, indeterminate, onToggle, children }: {
  checked: boolean;
  indeterminate: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ? true : indeterminate ? 'mixed' : false}
      className={styles.groupHeading}
      onClick={onToggle}
      data-filter-option
    >
      <Checkbox checked={checked} indeterminate={indeterminate} />
      {children}
    </button>
  );
}

export function FilterEmpty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

export function FilterDot({ color }: { color: string }) {
  return <span className={styles.dot} style={{ backgroundColor: color }} />;
}
