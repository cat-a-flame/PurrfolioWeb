'use client';

import Button from './Button';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
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
  onConfirm,
  onCancel,
  onDismiss,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <div className={styles.overlay} onClick={onDismiss ?? onCancel}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        <p id="confirm-message" className={styles.message}>
          {message}
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
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
