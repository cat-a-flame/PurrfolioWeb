'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.brand}>PennyPuff</h1>
          <p className={styles.tagline}>Your personal budget tracker</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <h2 className={styles.formTitle}>Sign in</h2>

          <div className={styles.field}>
            <FormLabel htmlFor="email" required>
              Email
            </FormLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.field}>
            <FormLabel htmlFor="password" required>
              Password
            </FormLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" loading={loading} className={styles.submitBtn}>
            Sign in
          </Button>
        </form>

        <p className={styles.switchLink}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className={styles.link}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
