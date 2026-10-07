'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi';
import type { Category, TransactionType } from '@/lib/types';
import styles from './CategoryPicker.module.css';

interface CategoryNode {
  category: Category;
  children: Category[];
}

/** One keyboard-navigable row of the open menu. */
interface MenuRow {
  key: string;
  kind: 'back' | 'parent' | 'leaf';
  category: Category;
}

interface CategoryPickerProps {
  id?: string;
  categories: Category[];
  mode: TransactionType;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export default function CategoryPicker({
  id,
  categories,
  mode,
  value,
  onChange,
  placeholder = 'Choose',
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [drillId, setDrillId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 320 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matchesMode = (c: Category) => c.type === 'both' || c.type === mode;

  // A parent with children isn't selectable, only its mode-matching children;
  // a childless parent is selectable if it matches the mode.
  const topNodes: CategoryNode[] = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);
    const nodes: CategoryNode[] = [];

    for (const parent of parents) {
      const allChildren = children.filter(c => c.parent_id === parent.id);
      if (allChildren.length > 0) {
        const matching = allChildren.filter(matchesMode);
        if (matching.length > 0) nodes.push({ category: parent, children: matching });
      } else if (matchesMode(parent)) {
        nodes.push({ category: parent, children: [] });
      }
    }

    for (const child of children.filter(c => !parents.find(p => p.id === c.parent_id) && matchesMode(c))) {
      nodes.push({ category: child, children: [] });
    }

    return nodes;
  }, [categories, mode]);

  const allSelectable: Category[] = useMemo(
    () => topNodes.flatMap(n => (n.children.length > 0 ? n.children : [n.category])),
    [topNodes]
  );

  const selected = categories.find(c => c.id === value) ?? null;
  const drillNode = drillId ? topNodes.find(n => n.category.id === drillId) ?? null : null;

  const searchResults = search.trim()
    ? allSelectable.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : null;

  const rows: MenuRow[] = searchResults
    ? searchResults.map(c => ({ key: c.id, kind: 'leaf', category: c }))
    : drillNode
      ? [
          { key: `back-${drillNode.category.id}`, kind: 'back', category: drillNode.category },
          ...drillNode.children.map((c): MenuRow => ({ key: c.id, kind: 'leaf', category: c })),
        ]
      : topNodes.map(n => ({ key: n.category.id, kind: n.children.length > 0 ? 'parent' : 'leaf', category: n.category }));

  const optionId = (i: number) => `${listId}-option-${i}`;

  function updateMenuPosition() {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxHeight = Math.max(160, Math.min(320, window.innerHeight - rect.bottom - 16));
    setMenuStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight });
  }

  function openMenu() {
    updateMenuPosition();
    setSearch('');
    setDrillId(null);
    // Start on the current selection's top-level row, if it has one.
    const selectedTop = topNodes.findIndex(n =>
      n.category.id === value || n.children.some(c => c.id === value));
    setActiveIndex(Math.max(0, selectedTop));
    setOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeMenu(refocus = false) {
    setOpen(false);
    if (refocus) controlRef.current?.focus();
  }

  function selectCategory(c: Category) {
    onChange(c.id);
    closeMenu(true);
  }

  function drillInto(parentId: string) {
    setDrillId(parentId);
    setActiveIndex(1); // first child; row 0 is the back row
  }

  function drillOut() {
    const parentId = drillId;
    setDrillId(null);
    setActiveIndex(Math.max(0, topNodes.findIndex(n => n.category.id === parentId)));
  }

  function activateRow(row: MenuRow) {
    if (row.kind === 'back') drillOut();
    else if (row.kind === 'parent') drillInto(row.category.id);
    else selectCategory(row.category);
  }

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, drillId, search]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu(true);
    }
    function onReposition() {
      updateMenuPosition();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    document.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      document.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  function onSearchKeyDown(e: React.KeyboardEvent) {
    const row = rows[activeIndex];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (rows.length) setActiveIndex(i => (i + 1) % rows.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (rows.length) setActiveIndex(i => (i - 1 + rows.length) % rows.length);
        break;
      case 'Home':
      case 'End':
        // Leave Home/End to the text cursor while there's text to move through.
        if (search) break;
        e.preventDefault();
        setActiveIndex(e.key === 'Home' ? 0 : Math.max(0, rows.length - 1));
        break;
      case 'ArrowRight':
        if (row?.kind === 'parent' && !search) {
          e.preventDefault();
          drillInto(row.category.id);
        }
        break;
      case 'ArrowLeft':
        if (drillNode && !search) {
          e.preventDefault();
          drillOut();
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (row) activateRow(row);
        break;
      case 'Tab':
        closeMenu();
        break;
    }
  }

  function onControlKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openMenu();
    }
  }

  function renderRow(row: MenuRow, i: number) {
    const active = i === activeIndex;
    const isBack = row.kind === 'back';
    return (
      <button
        key={row.key}
        id={optionId(i)}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={row.kind !== 'back' && row.category.id === value}
        className={[isBack ? styles.backItem : styles.item, active ? styles.itemActive : ''].filter(Boolean).join(' ')}
        onMouseMove={() => { if (!active) setActiveIndex(i); }}
        onClick={() => activateRow(row)}
      >
        {isBack ? (
          <><FiChevronLeft /> {row.category.icon} {row.category.name}</>
        ) : (
          <>
            <span className={styles.itemLabel}>{row.category.icon} {row.category.name}</span>
            {row.kind === 'parent' && <FiChevronRight className={styles.itemChevron} />}
          </>
        )}
      </button>
    );
  }

  const emptyMessage = searchResults
    ? 'No categories found'
    : !drillNode && topNodes.length === 0 ? 'No categories available' : null;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        id={id}
        ref={controlRef}
        type="button"
        className={[styles.control, open ? styles.controlOpen : ''].filter(Boolean).join(' ')}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onControlKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? styles.controlValue : styles.controlPlaceholder}>
          {selected ? `${selected.icon} ${selected.name}` : placeholder}
        </span>
        <FiChevronDown className={styles.chevron} />
      </button>

      {open && (
        <div
          className={styles.menu}
          style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width, maxHeight: menuStyle.maxHeight }}
        >
          <div className={styles.searchRow}>
            <FiSearch className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.searchInput}
              placeholder="Search categories…"
              value={search}
              onChange={e => { setSearch(e.target.value); setDrillId(null); setActiveIndex(0); }}
              onKeyDown={onSearchKeyDown}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={rows[activeIndex] ? optionId(activeIndex) : undefined}
            />
          </div>

          <div className={styles.list} id={listId} role="listbox">
            {rows.length === 0 && emptyMessage
              ? <div className={styles.empty}>{emptyMessage}</div>
              : rows.map(renderRow)}
          </div>
        </div>
      )}
    </div>
  );
}
