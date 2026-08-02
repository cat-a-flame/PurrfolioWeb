'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi';
import type { Category, TransactionType } from '@/lib/types';
import styles from './CategoryPicker.module.css';

interface CategoryNode {
  category: Category;
  children: Category[];
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
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 320 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const matchesMode = (c: Category) => c.type === 'both' || c.type === mode;

  // Same grouping rules as before: a parent with any children is never
  // itself selectable — only its mode-matching children are. A parent
  // with no children is selectable directly if it matches the mode.
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
    setOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeMenu() {
    setOpen(false);
  }

  function selectCategory(c: Category) {
    onChange(c.id);
    closeMenu();
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
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
    if (e.key === 'Enter' && searchResults && searchResults.length > 0) {
      e.preventDefault();
      selectCategory(searchResults[0]);
    }
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        id={id}
        ref={controlRef}
        type="button"
        className={[styles.control, open ? styles.controlOpen : ''].filter(Boolean).join(' ')}
        onClick={() => (open ? closeMenu() : openMenu())}
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
          role="listbox"
        >
          <div className={styles.searchRow}>
            <FiSearch className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.searchInput}
              placeholder="Search categories…"
              value={search}
              onChange={e => { setSearch(e.target.value); setDrillId(null); }}
              onKeyDown={onSearchKeyDown}
            />
          </div>

          <div className={styles.list}>
            {searchResults ? (
              searchResults.length === 0 ? (
                <div className={styles.empty}>No categories found</div>
              ) : (
                searchResults.map(c => (
                  <button key={c.id} type="button" className={styles.item} onClick={() => selectCategory(c)}>
                    <span className={styles.itemLabel}>{c.icon} {c.name}</span>
                  </button>
                ))
              )
            ) : drillNode ? (
              <>
                <button type="button" className={styles.backItem} onClick={() => setDrillId(null)}>
                  <FiChevronLeft /> {drillNode.category.icon} {drillNode.category.name}
                </button>
                {drillNode.children.map(c => (
                  <button key={c.id} type="button" className={styles.item} onClick={() => selectCategory(c)}>
                    <span className={styles.itemLabel}>{c.icon} {c.name}</span>
                  </button>
                ))}
              </>
            ) : topNodes.length === 0 ? (
              <div className={styles.empty}>No categories available</div>
            ) : (
              topNodes.map(node => (
                <button
                  key={node.category.id}
                  type="button"
                  className={styles.item}
                  onClick={() => (node.children.length > 0 ? setDrillId(node.category.id) : selectCategory(node.category))}
                >
                  <span className={styles.itemLabel}>{node.category.icon} {node.category.name}</span>
                  {node.children.length > 0 && <FiChevronRight className={styles.itemChevron} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
