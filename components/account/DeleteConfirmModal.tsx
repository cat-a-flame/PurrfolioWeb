'use client';

import { useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import styles from './DeleteConfirmModal.module.css';

const CONFIRM_WORD = 'DELETE';

interface DeleteConfirmModalProps {
  title: string;
  intro: React.ReactNode;
  confirmLabel: string;
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteConfirmModal({
  title,
  intro,
  confirmLabel,
  loading,
  error,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim() === CONFIRM_WORD;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canConfirm && !loading) onConfirm();
  }

  return (
    <Dialog
      title={title}
      icon={<FiAlertTriangle />}
      onClose={loading ? () => {} : onClose}
      maxWidth={480}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.intro}>{intro}</p>

        <div className={styles.warning} role="alert">
          <ul className={styles.warningList}>
            <li><strong>This cannot be undone.</strong></li>
            <li>Make sure you have exported everything you want to keep before continuing.</li>
            <li>We cannot restore anything once it has been deleted.</li>
          </ul>
        </div>

        <div className={styles.field}>
          <FormLabel htmlFor="delete-confirm">
            Type <span className={styles.confirmWord}>{CONFIRM_WORD}</span> to confirm
          </FormLabel>
          <Input
            id="delete-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={loading}
            error={error}
          />
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="md" disabled={!canConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
