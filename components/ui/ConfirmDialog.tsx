'use client';

import { useId, useRef } from 'react';
import Button from './Button';
import { useDialogFocus } from './useDialogFocus';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  cancelVariant?: 'secondary' | 'ghost';
  onConfirm: () => void;
  onCancel: () => void;
  /** Called when the overlay is clicked to dismiss. Defaults to onCancel. */
  onDismiss?: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  cancelVariant = 'ghost',
  onConfirm,
  onCancel,
  onDismiss,
  loading = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { initialFocus: '[data-cancel]' });

  return (
    <div className={styles.overlay} onClick={onDismiss ?? onCancel}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div id={messageId} className={styles.message}>
          {message}
        </div>
        <div className={styles.actions}>
          <Button variant={cancelVariant} size="md" data-cancel onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} size="md" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
