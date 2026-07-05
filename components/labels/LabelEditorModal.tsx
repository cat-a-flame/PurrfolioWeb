'use client';

import { useState } from 'react';
import { FaTrash } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import ColorSwatchField from '@/components/ui/ColorSwatchField';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import styles from './LabelEditorModal.module.css';

export interface LabelDraft {
  name: string;
  color: string;
}

interface LabelEditorModalProps {
  mode: 'create' | 'edit';
  initial: LabelDraft;
  canDelete: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: LabelDraft) => void;
  onDelete: () => void;
}

export default function LabelEditorModal({
  mode, initial, canDelete, saving, onClose, onSave, onDelete,
}: LabelEditorModalProps) {
  const [draft, setDraft] = useState<LabelDraft>(initial);
  const isEdit = mode === 'edit';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(draft);
  }

  return (
    <Dialog
      title={isEdit ? 'Edit label' : 'New label'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.nameField}>
          <FormLabel htmlFor="label-name" required>Label name</FormLabel>
          <Input
            id="label-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Recurring"
            aria-label="Label name"
            autoFocus
          />
        </div>

        <div className={styles.section}>
          <FormLabel>Color</FormLabel>
          <ColorSwatchField
            value={draft.color}
            onChange={(color) => setDraft((d) => ({ ...d, color }))}
            ariaLabel="Label color"
          />
        </div>

        <div className={styles.section}>
          <FormLabel>Preview</FormLabel>
          <div className={styles.preview}>
            <span className={styles.previewDot} style={{ background: draft.color }} />
            {draft.name || 'Label'}
          </div>
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
            {isEdit ? 'Save changes' : 'Create label'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
