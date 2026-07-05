'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import styles from './CategoryEditorModal.module.css';

export interface SubDraft {
  id?: string;
  _key: string;
  icon: string;
  name: string;
}

export interface CategoryDraft {
  name: string;
  icon: string;
  color: string;
  subs: SubDraft[];
}

interface CategoryEditorModalProps {
  mode: 'create' | 'edit';
  initial: CategoryDraft;
  canDelete: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: CategoryDraft) => void;
  onDelete: () => void;
}

let subKeySeq = 0;
function nextSubKey() { return `new-${++subKeySeq}`; }

export default function CategoryEditorModal({
  mode, initial, canDelete, saving, onClose, onSave, onDelete,
}: CategoryEditorModalProps) {
  const [draft, setDraft] = useState<CategoryDraft>(initial);
  const isEdit = mode === 'edit';

  function patchSub(key: string, patch: Partial<SubDraft>) {
    setDraft((d) => ({ ...d, subs: d.subs.map((s) => (s._key === key ? { ...s, ...patch } : s)) }));
  }

  function removeSub(key: string) {
    setDraft((d) => ({ ...d, subs: d.subs.filter((s) => s._key !== key) }));
  }

  function addSub() {
    setDraft((d) => ({ ...d, subs: [...d.subs, { _key: nextSubKey(), icon: '🏷️', name: '' }] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(draft);
  }

  return (
    <Dialog
      title={isEdit ? 'Edit category' : 'New category'}
      subtitle={isEdit ? 'Update icon, color and subcategories' : 'Set up a category to organize transactions'}
      icon={
        <div
          className={styles.previewTile}
          style={{ background: draft.color, boxShadow: `0 10px 22px -8px ${draft.color}` }}
        >
          {draft.icon || '🙂'}
        </div>
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.iconNameRow}>
          <div className={styles.iconField}>
            <label className={styles.label} htmlFor="cat-emoji">ICON</label>
            <input
              id="cat-emoji"
              className={styles.emojiInput}
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              maxLength={4}
              placeholder="🙂"
              aria-label="Category emoji"
            />
          </div>
          <div className={styles.nameField}>
            <label className={styles.label} htmlFor="cat-name">CATEGORY NAME</label>
            <input
              id="cat-name"
              className={styles.nameInput}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Food & Dining"
              aria-label="Category name"
              autoFocus
            />
          </div>
        </div>
        <div className={styles.hint}>Type or paste any emoji as the icon.</div>

        <label className={styles.label} style={{ display: 'block', margin: '22px 0 10px' }}>COLOR</label>
        <label className={styles.colorField}>
          <span className={styles.colorSwatch} style={{ background: draft.color }}>
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              aria-label="Category color"
              className={styles.colorInput}
            />
          </span>
          <span>
            <span className={styles.colorHex}>{draft.color.toUpperCase()}</span>
            <span className={styles.colorHint}>Click to open color picker</span>
          </span>
        </label>

        <div className={styles.subsHeader}>
          <label className={styles.label}>SUBCATEGORIES</label>
          <span className={styles.optional}>Optional</span>
        </div>
        <div className={styles.subsList}>
          {draft.subs.map((s) => (
            <div key={s._key} className={styles.subRow}>
              <input
                className={styles.subEmojiInput}
                value={s.icon}
                onChange={(e) => patchSub(s._key, { icon: e.target.value })}
                maxLength={4}
                aria-label="Subcategory emoji"
              />
              <input
                className={styles.subNameInput}
                value={s.name}
                onChange={(e) => patchSub(s._key, { name: e.target.value })}
                placeholder="Subcategory name"
                aria-label="Subcategory name"
              />
              <button
                type="button"
                className={styles.subRemoveBtn}
                onClick={() => removeSub(s._key)}
                aria-label="Remove subcategory"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className={styles.addSubBtn} onClick={addSub}>
            <span className={styles.addSubPlus}>+</span> Add subcategory
          </button>
        </div>

        <div className={styles.footer}>
          {canDelete && (
            <Button type="button" variant="danger" size="md" onClick={onDelete}>
              🗑 Delete
            </Button>
          )}
          <div className={styles.spacer} />
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="md" loading={saving}>
            {isEdit ? 'Save changes' : 'Create category'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
