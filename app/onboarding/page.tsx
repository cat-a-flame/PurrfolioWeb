'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactSelect from 'react-select';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import { useBaseCurrencyState } from '@/contexts/BaseCurrencyContext';
import { CURRENCIES } from '@/lib/baseCurrency';
import { createClient } from '@/lib/supabase/client';
import type { AccountType, Currency, Wallet } from '@/lib/types';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '@/lib/utils';
import styles from '@/app/login/page.module.css';
import onboardingStyles from './page.module.css';

const CURRENCY_NAMES: Record<Currency, string> = {
  HUF: 'Hungarian Forint',
  EUR: 'Euro',
  USD: 'US Dollar',
};

type TypeOption = { value: AccountType; label: string };
const typeOptions: TypeOption[] = ACCOUNT_TYPES.map(t => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

// First-run setup: the currency of the first account becomes the base currency for all totals.
export default function OnboardingPage() {
  const router = useRouter();
  const { resolved, setBaseCurrency } = useBaseCurrencyState();
  const [existing, setExisting] = useState<Wallet | null>(null);
  const [name, setName] = useState('Main account');
  const [type, setType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (resolved) router.replace('/dashboard');
  }, [resolved, router]);

  // A signup may already have created a default account; set that one up instead of adding a second.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('wallets').select('*').order('created_at', { ascending: true });
      const wallets = (data ?? []) as Wallet[];
      const wallet = wallets.find(w => w.is_default) ?? wallets[0] ?? null;
      if (!wallet) return;
      setExisting(wallet);
      setName(wallet.name);
      setType(wallet.type ?? 'bank');
      setCurrency(wallet.currency);
      setBalance(String(wallet.starting_balance));
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Changing a currency under existing transactions would corrupt them.
    const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) {
      setLoading(false);
      router.replace('/dashboard');
      return;
    }

    const parsedBalance = parseFloat(balance);
    const fields = {
      name: name.trim() || 'Main account',
      currency,
      type,
      starting_balance: isNaN(parsedBalance) ? 0 : parsedBalance,
    };

    const { error: walletError } = existing
      ? await supabase.from('wallets').update(fields).eq('id', existing.id)
      : await supabase.from('wallets').insert({
          ...fields, user_id: user.id, icon: '💰', color: '#7a5ce0', is_default: true,
        });
    if (walletError) {
      setError('Could not save your account. Please try again.');
      setLoading(false);
      return;
    }

    if (!(await setBaseCurrency(currency))) {
      setError('Could not save your base currency. Please try again.');
      setLoading(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/logo.png" alt="" className={styles.logo} />
          <h1 className={styles.brand}>Purrfolio</h1>
          <p className={styles.tagline}>Let’s set up your first account</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <p className={onboardingStyles.intro}>
            The currency of your first account is your base currency: totals, statistics and net worth are
            shown in it, and records in other currencies are converted to it.
          </p>

          <div className={styles.field}>
            <FormLabel>Currency</FormLabel>
            <div className={onboardingStyles.currencyGrid} role="radiogroup" aria-label="Currency">
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={currency === c}
                  className={[
                    onboardingStyles.currencyOption,
                    currency === c ? onboardingStyles.currencyOptionActive : '',
                  ].join(' ')}
                  onClick={() => setCurrency(c)}
                >
                  <span className={onboardingStyles.currencyCode}>{c}</span>
                  <span className={onboardingStyles.currencyName}>{CURRENCY_NAMES[c]}</span>
                </button>
              ))}
            </div>
            <p className={onboardingStyles.hint}>This can’t be changed later.</p>
          </div>

          <div className={styles.field}>
            <FormLabel htmlFor="account-name" required>Account name</FormLabel>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main account"
              required
            />
          </div>

          <div className={styles.field}>
            <FormLabel htmlFor="account-type">Type</FormLabel>
            <ReactSelect<TypeOption>
              inputId="account-type"
              options={typeOptions}
              value={typeOptions.find(o => o.value === type) ?? typeOptions[0]}
              onChange={(opt) => opt && setType(opt.value)}
              isSearchable={false}
              styles={makeRsStyles<TypeOption>()}
              theme={rsTheme}
              menuPosition="fixed"
            />
          </div>

          <div className={styles.field}>
            <FormLabel htmlFor="account-balance">Starting balance</FormLabel>
            <NumberInput id="account-balance" value={balance} onChange={setBalance} placeholder="0" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" size="lg" loading={loading} className={styles.submitBtn}>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
