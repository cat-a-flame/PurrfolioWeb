'use client';

import { useCallback, useEffect, useState } from 'react';
import { FiShield } from 'react-icons/fi';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Switch from '@/components/ui/Switch';
import { createClient } from '@/lib/supabase/client';
import { cleanCode } from '@/lib/mfa';
import accountStyles from '@/app/account/page.module.css';
import styles from './TwoFactorSection.module.css';

type Enrollment = { factorId: string; qrCode: string; secret: string };

interface TwoFactorSectionProps {
  onMessage: (message: string, variant: 'success' | 'error') => void;
}

/** Account page section for turning authenticator-app 2FA (TOTP) on and off. */
export default function TwoFactorSection({ onMessage }: TwoFactorSectionProps) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp[0]?.id ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startSetup() {
    setStarting(true);
    const supabase = createClient();

    // A setup that was abandoned earlier leaves an unverified factor behind,
    // which would block a new one with the same name.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator app',
      issuer: 'Purrfolio',
    });
    setStarting(false);
    if (enrollError || !data) {
      onMessage(enrollError?.message ?? 'Could not start 2FA setup.', 'error');
      return;
    }
    setCode('');
    setError('');
    setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function cancelSetup() {
    if (!enrollment) return;
    const pending = enrollment.factorId;
    setEnrollment(null);
    await createClient().auth.mfa.unenroll({ factorId: pending });
  }

  function openDisable() {
    setCode('');
    setError('');
    setDisabling(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetId = enrollment?.factorId ?? factorId;
    if (!targetId) return;
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    const supabase = createClient();

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: targetId,
      code,
    });
    if (verifyError) {
      setBusy(false);
      setCode('');
      setError('That code didn’t work. Check your app and try again.');
      return;
    }

    if (enrollment) {
      setBusy(false);
      setEnrollment(null);
      setFactorId(targetId);
      onMessage('Two-factor authentication is on.', 'success');
      return;
    }

    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: targetId });
    setBusy(false);
    if (unenrollError) {
      setError(unenrollError.message);
      return;
    }
    // Pick up the user's new factor list in the stored session.
    await supabase.auth.refreshSession();
    setDisabling(false);
    setFactorId(null);
    onMessage('Two-factor authentication is off.', 'success');
  }

  const enabled = !!factorId;

  return (
    <section className={accountStyles.section}>
      <h2 className={accountStyles.sectionTitle}>Two-factor authentication</h2>
      <div className={styles.row}>
        <p className={styles.description}>
          Ask for a 6-digit code from an authenticator app each time you sign in, in addition
          to your password.
        </p>
        <Switch
          id="two-factor"
          checked={enabled || !!enrollment || starting}
          onChange={(on) => (on ? startSetup() : openDisable())}
          disabled={!loaded || starting}
        />
      </div>

      {(enrollment || disabling) && (
        <Dialog
          title={enrollment ? 'Set up two-factor authentication' : 'Turn off two-factor authentication?'}
          icon={<FiShield />}
          onClose={busy ? () => {} : enrollment ? cancelSetup : () => setDisabling(false)}
          maxWidth={460}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            {enrollment ? (
              <>
                <p className={styles.intro}>
                  1. Scan this QR code with your authenticator app.
                </p>
                <img src={enrollment.qrCode} alt="QR code for your authenticator app" className={styles.qr} />
                <p className={styles.hint}>
                  Can’t scan it? Enter this key in the app instead:
                </p>
                <code className={styles.secret}>{enrollment.secret}</code>
                <p className={styles.intro}>2. Enter the 6-digit code the app shows.</p>
              </>
            ) : (
              <p className={styles.intro}>
                Signing in will only need your password again. Enter a code from your
                authenticator app to confirm.
              </p>
            )}

            <div className={styles.field}>
              <FormLabel htmlFor="mfa-code">Code</FormLabel>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                placeholder="123456"
                maxLength={6}
                autoFocus={!enrollment}
                disabled={busy}
                error={error}
              />
            </div>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={enrollment ? cancelSetup : () => setDisabling(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" variant={enrollment ? 'primary' : 'danger'} size="md" loading={busy}>
                {enrollment ? 'Turn on' : 'Turn off'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
