'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import DeleteConfirmModal from '@/components/account/DeleteConfirmModal';
import TwoFactorSection from '@/components/account/TwoFactorSection';
import { createClient, verifyPassword } from '@/lib/supabase/client';
import styles from './page.module.css';

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<'data' | 'account' | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null
  );

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback(
    (message: string, variant: 'success' | 'error') => setToast({ message, variant }),
    []
  );

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
      if (user?.user_metadata?.username) {
        setUsername(user.user_metadata.username as string);
      }
    }
    loadProfile();
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleUsernameUpdate(e: React.FormEvent) {
    e.preventDefault();
    setUsernameError('');
    if (!username.trim()) {
      setUsernameError('Username cannot be empty.');
      return;
    }
    setUsernameLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { username: username.trim() },
    });
    setUsernameLoading(false);
    if (error) {
      setUsernameError(error.message);
    } else {
      setToast({ message: 'Username updated.', variant: 'success' });
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    setPasswordLoading(true);
    // Check the current password first, so someone with access to an
    // already signed-in browser can't change it and lock the owner out.
    if (!(await verifyPassword(email, currentPassword))) {
      setPasswordLoading(false);
      setPasswordError('Current password is incorrect.');
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      setPasswordError(error.message);
    } else {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({ message: 'Password updated.', variant: 'success' });
    }
  }

  function openDelete(target: 'data' | 'account') {
    setDeleteError('');
    setDeleteTarget(target);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    const supabase = createClient();

    if (deleteTarget === 'data') {
      const { error } = await supabase.rpc('delete_my_data');
      if (error) {
        setDeleteLoading(false);
        setDeleteError(error.message);
        return;
      }
      // Full reload so cached data in shared contexts is dropped too.
      window.location.assign('/dashboard');
      return;
    }

    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setDeleteLoading(false);
      setDeleteError(error.message);
      return;
    }
    // The user no longer exists server-side, so only clear the local session.
    await supabase.auth.signOut({ scope: 'local' });
    window.location.assign('/login');
  }

  return (
    <AppShell>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Account</h1>

          {/* Profile section */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Profile</h2>
            <form onSubmit={handleUsernameUpdate} className={styles.form}>
              {email && (
                <div className={styles.field}>
                  <FormLabel>Email</FormLabel>
                  <Input type="email" value={email} disabled />
                </div>
              )}
              <div className={styles.field}>
                <FormLabel htmlFor="username">Username</FormLabel>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your display name"
                  error={usernameError}
                />
              </div>
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" size="sm" loading={usernameLoading}>
                  Save username
                </Button>
              </div>
            </form>
          </section>

          {/* Change password section */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Change password</h2>
            <form onSubmit={handlePasswordUpdate} className={styles.form}>
              <div className={styles.field}>
                <FormLabel htmlFor="current-password">Current password</FormLabel>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div className={styles.field}>
                <FormLabel htmlFor="new-password">New password</FormLabel>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.field}>
                <FormLabel htmlFor="confirm-password">Confirm new password</FormLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  error={passwordError}
                />
              </div>
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" size="sm" loading={passwordLoading}>
                  Update password
                </Button>
              </div>
            </form>
          </section>

          <TwoFactorSection onMessage={showToast} />

          {/* Session section */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Session</h2>
            <div className={styles.formActions}>
              <Button variant="danger" size="sm" onClick={handleSignOut} loading={signingOut}>
                Sign out
              </Button>
            </div>
          </section>

          {/* Danger zone */}
          <section className={`${styles.section} ${styles.dangerSection}`}>
            <h2 className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Danger zone</h2>

            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <h3 className={styles.dangerRowTitle}>Delete all data</h3>
                <p className={styles.dangerDescription}>
                  Permanently removes all your transactions, recurring payments, templates, accounts,
                  categories and labels. Your login stays, so you can start fresh.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => openDelete('data')}>
                Delete all data
              </Button>
            </div>

            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <h3 className={styles.dangerRowTitle}>Delete account</h3>
                <p className={styles.dangerDescription}>
                  Permanently deletes your account and all of its data. You will be signed out
                  and will not be able to log in again with this account.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => openDelete('account')}>
                Delete account
              </Button>
            </div>
          </section>
      </div>

      {deleteTarget === 'data' && (
        <DeleteConfirmModal
          title="Delete all data?"
          intro="All your transactions, recurring payments, templates, accounts, categories and labels will be permanently deleted. Your account and login will be kept."
          confirmLabel="Delete all data"
          loading={deleteLoading}
          error={deleteError}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {deleteTarget === 'account' && (
        <DeleteConfirmModal
          title="Delete your account?"
          intro="Your account and all of its data (transactions, recurring payments, templates, accounts, categories and labels) will be permanently deleted, and you will be signed out."
          confirmLabel="Delete account"
          loading={deleteLoading}
          error={deleteError}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      )}
    </AppShell>
  );
}
