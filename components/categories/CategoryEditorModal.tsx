'use client';

import { useState } from 'react';
import { FaTrash } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import ColorSwatchField from '@/components/ui/ColorSwatchField';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import type { TransactionType } from '@/lib/types';
import { hexToRgba } from '@/lib/colorUtils';
import styles from './CategoryEditorModal.module.css';

export type CategoryDraftType = TransactionType | 'both';

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
  type: CategoryDraftType;
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
          style={{ background: hexToRgba(draft.color, 0.25), boxShadow: `0 10px 22px -8px ${draft.color}` }}
        >
          {draft.icon || '🙂'}
        </div>
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.iconNameRow}>
          <div className={styles.iconField}>
            <FormLabel htmlFor="cat-emoji">Icon</FormLabel>
            <Input
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
            <FormLabel htmlFor="cat-name" required>Category name</FormLabel>
            <Input
              id="cat-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Food & Dining"
              aria-label="Category name"
              autoFocus
            />
          </div>
        </div>
        <div className={styles.hint}>Type or paste any emoji as the icon.</div>

        <div className={styles.section}>
          <FormLabel>Type</FormLabel>
          <div className={styles.typeTabs}>
            <button
              type="button"
              className={[styles.typeTab, draft.type === 'expense' ? styles.typeTabExpenseActive : ''].filter(Boolean).join(' ')}
              onClick={() => setDraft((d) => ({ ...d, type: 'expense' }))}
            >
              Expense
            </button>
            <button
              type="button"
              className={[styles.typeTab, draft.type === 'income' ? styles.typeTabIncomeActive : ''].filter(Boolean).join(' ')}
              onClick={() => setDraft((d) => ({ ...d, type: 'income' }))}
            >
              Income
            </button>
            <button
              type="button"
              className={[styles.typeTab, draft.type === 'both' ? styles.typeTabBothActive : ''].filter(Boolean).join(' ')}
              onClick={() => setDraft((d) => ({ ...d, type: 'both' }))}
            >
              Both
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <FormLabel>Color</FormLabel>
          <ColorSwatchField
            value={draft.color}
            onChange={(color) => setDraft((d) => ({ ...d, color }))}
            ariaLabel="Category color"
          />
        </div>

        <div className={styles.subsHeader}>
          <FormLabel>Subcategories</FormLabel>
          <span className={styles.optional}>Optional</span>
        </div>
        <div className={styles.subsList}>
          {draft.subs.map((s) => (
            <div key={s._key} className={styles.subRow}>
              <div className={styles.subEmojiWrap}>
                <Input
                  className={styles.subEmojiInput}
                  value={s.icon}
                  onChange={(e) => patchSub(s._key, { icon: e.target.value })}
                  maxLength={4}
                  aria-label="Subcategory emoji"
                />
              </div>
              <div className={styles.subNameWrap}>
                <Input
                  value={s.name}
                  onChange={(e) => patchSub(s._key, { name: e.target.value })}
                  placeholder="Subcategory name"
                  aria-label="Subcategory name"
                />
              </div>
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
              <FaTrash style={{ display: 'inline-block' }} /> Delete
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
