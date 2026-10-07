'use client';

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import EmojiBox from '@/components/ui/EmojiBox';
import FormLabel from '@/components/ui/FormLabel';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { hidesNav } from '@/lib/publicPaths';
import styles from './ReportBugButton.module.css';

/** Sends a bug report to Discord via report_bug(). */
export default function ReportBugButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [canContact, setCanContact] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const close = useCallback(() => setOpen(false), []);
  const dismissToast = useCallback(() => setToast(''), []);

  if (hidesNav(pathname) || pathname === '/mfa') return null;

  function openDialog() {
    setMessage('');
    setCanContact(false);
    setError('');
    setOpen(true);
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
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
      can_contact: canContact,
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
      <button type="button" className={styles.fab} onClick={openDialog} aria-label="Report a bug">
        <span className={styles.fabEmoji} aria-hidden>🐞</span>
        <span className={styles.fabLabel} aria-hidden>Report a bug</span>
      </button>

      {open && (
        <Dialog
          title="Report a bug"
          subtitle="Tell us what happened and what you expected instead."
          icon={<EmojiBox emoji="🐞" color="#7433e6" size="xl" />}
          onClose={close}
          maxWidth={620}
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
            <p className={styles.hint}>
              Your email{email ? <> (<strong>{email}</strong>)</> : null}, the current page and your
              browser are sent with the report to help us reproduce it.
            </p>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={canContact}
                onChange={e => setCanContact(e.target.checked)}
              />
              <span>You can contact me by email for more details</span>
            </label>

            <div className={styles.footer}>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" loading={sending}>Send report</Button>
            </div>
          </form>
        </Dialog>
      )}

      {toast && <Toast message={toast} variant="success" onDismiss={dismissToast} />}
    </>
  );
}
