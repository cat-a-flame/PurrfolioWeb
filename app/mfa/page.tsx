'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cleanCode } from '@/lib/mfa';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import styles from '../login/page.module.css';

export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp[0];
    if (factorsError || !factor) {
      setError(factorsError?.message ?? 'No authenticator app found for this account.');
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (verifyError) {
      setError('That code didn’t work. Check your app and try again.');
      setCode('');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/logo.png" alt="" className={styles.logo} />
          <h1 className={styles.brand}>Purrfolio</h1>
          <p className={styles.tagline}>Your personal budget tracker</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <h2 className={styles.formTitle}>Two-factor authentication</h2>
          <p className={styles.tagline}>
            Open your authenticator app and enter the 6-digit code for Purrfolio.
          </p>

          <div className={styles.field}>
            <FormLabel htmlFor="code" required>
              Code
            </FormLabel>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              placeholder="123456"
              maxLength={6}
              autoFocus
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" size="lg" loading={loading} className={styles.submitBtn}>
            Verify
          </Button>
        </form>

        <p className={styles.switchLink}>
          Not you?{' '}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className={`${styles.link} ${styles.linkButton}`}
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
