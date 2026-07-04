'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Something went wrong.</p>
      <p style={{ color: 'var(--color-text-secondary, #888)', maxWidth: '28rem' }}>
        The page ran into an unexpected error. Your data is safe — try again.
      </p>
      <Button variant="primary" size="md" onClick={reset}>Try again</Button>
    </div>
  );
}
