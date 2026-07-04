'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

export default function AccountPage() {
  const [username, setUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.user_metadata?.username) {
        setUsername(user.user_metadata.username as string);
      }
    }
    loadProfile();
  }, []);

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

  return (
    <AppShell>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Account</h1>

          {/* Profile section */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Profile</h2>
            <form onSubmit={handleUsernameUpdate} className={styles.form}>
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
      </div>

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
