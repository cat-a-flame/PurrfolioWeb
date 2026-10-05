'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { FiAlertCircle } from 'react-icons/fi';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import styles from './ReportBugButton.module.css';

interface ReportBugButtonProps {
  /** Matches the row style of the surrounding menu. */
  variant: 'sidebar' | 'drawer';
}

/** Menu row that opens a dialog for sending a bug report to Discord (report_bug()). */
export default function ReportBugButton({ variant }: ReportBugButtonProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const close = useCallback(() => setOpen(false), []);
  const dismissToast = useCallback(() => setToast(''), []);

  function openDialog() {
    setMessage('');
    setError('');
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) {
      setError('Please describe what went wrong.');
      return;
    }
    setSending(true);
    setError('');
    const { error: sendError } = await createClient().rpc('report_bug', {
      message: text,
      page: pathname,
      user_agent: navigator.userAgent,
    });
    setSending(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setOpen(false);
    setToast('Thanks! Your report was sent.');
  }

  return (
    <>
      <button
        type="button"
        className={[styles.trigger, styles[variant]].join(' ')}
        onClick={openDialog}
      >
        <FiAlertCircle className={styles.icon} aria-hidden />
        <span className={styles.label}>Report a bug</span>
      </button>

      {/* Portaled: the sidebar/drawer use backdrop-filter, which would trap
          position: fixed children inside them. */}
      {open && createPortal(
        <Dialog
          title="Report a bug"
          subtitle="Tell us what happened and what you expected instead."
          icon={<FiAlertCircle size={22} />}
          onClose={close}
          maxWidth={480}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <FormLabel htmlFor="bug-message" required>What went wrong?</FormLabel>
            <textarea
              id="bug-message"
              className={styles.textarea}
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <p className={styles.hint}>The current page and your browser are included to help us reproduce it.</p>
            <div className={styles.footer}>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" loading={sending}>Send report</Button>
            </div>
          </form>
        </Dialog>,
        document.body
      )}

      {toast && createPortal(
        <Toast message={toast} variant="success" onDismiss={dismissToast} />,
        document.body
      )}
    </>
  );
}
