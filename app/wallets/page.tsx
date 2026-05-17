'use client';

import { useEffect, useState, useCallback } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import type { Wallet, Currency } from '@/lib/types';
import styles from './page.module.css';

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];

const CURRENCY_LABELS: Record<Currency, string> = {
  HUF: 'HUF — Hungarian Forint',
  USD: 'USD — US Dollar',
  EUR: 'EUR — Euro',
};

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#f26e4d');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deletingWallet, setDeletingWallet] = useState<Wallet | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchWallets = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (data) setWallets(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // If new wallet is default, unset existing defaults first
    if (isDefault) {
      await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
    }

    const { error } = await supabase.from('wallets').insert({
      user_id: user.id,
      name: name.trim(),
      currency,
      icon: icon.trim() || '💰',
      color,
      is_default: isDefault,
    });

    setSaving(false);
    if (error) {
      setFormError(error.message);
    } else {
      setName(''); setIcon(''); setColor('#f26e4d'); setCurrency('HUF'); setIsDefault(false);
      setToast({ message: 'Wallet added.', variant: 'success' });
      await fetchWallets();
    }
  }

  async function handleSetDefault(wallet: Wallet) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('wallets').update({ is_default: true }).eq('id', wallet.id);
    setToast({ message: `"${wallet.name}" set as default.`, variant: 'success' });
    await fetchWallets();
  }

  async function handleDelete() {
    if (!deletingWallet) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('wallets').delete().eq('id', deletingWallet.id);
    setDeleteLoading(false);
    setDeletingWallet(null);
    if (error) {
      setToast({ message: 'Failed to delete wallet.', variant: 'error' });
    } else {
      setToast({ message: 'Wallet deleted.', variant: 'success' });
      await fetchWallets();
    }
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Wallets</h1>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add wallet</h2>
            <form onSubmit={handleAdd} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <FormLabel htmlFor="w-name">Name</FormLabel>
                  <Input id="w-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Savings" required />
                </div>
                <div className={styles.field}>
                  <FormLabel htmlFor="w-currency">Currency</FormLabel>
                  <select id="w-currency" className={styles.select} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <FormLabel htmlFor="w-icon">Icon (emoji)</FormLabel>
                  <Input id="w-icon" type="text" value={icon} onChange={e => setIcon(e.target.value)} placeholder="💰" maxLength={4} />
                </div>
                <div className={styles.field}>
                  <FormLabel htmlFor="w-color">Color</FormLabel>
                  <input id="w-color" type="color" className={styles.colorPicker} value={color} onChange={e => setColor(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <FormLabel htmlFor="w-default">Default</FormLabel>
                  <label className={styles.checkboxLabel}>
                    <input id="w-default" type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
                    Set as default wallet
                  </label>
                </div>
                <div className={styles.submitCol}>
                  <Button type="submit" variant="primary" size="md" loading={saving}>Add</Button>
                </div>
              </div>
              {formError && <p className={styles.formError}>{formError}</p>}
            </form>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your wallets</h2>
            {loading ? (
              <p className={styles.emptyState}>Loading…</p>
            ) : wallets.length === 0 ? (
              <p className={styles.emptyState}>No wallets yet. Add one above.</p>
            ) : (
              <div className={styles.list}>
                {wallets.map(wallet => (
                  <div key={wallet.id} className={styles.walletItem}>
                    <div className={styles.walletIcon} style={{ backgroundColor: wallet.color + '22' }}>
                      <span>{wallet.icon}</span>
                    </div>
                    <div className={styles.walletInfo}>
                      <span className={styles.walletName}>{wallet.name}</span>
                      <span className={styles.walletCurrency}>{wallet.currency}</span>
                    </div>
                    {wallet.is_default && <span className={styles.defaultBadge}>Default</span>}
                    <div className={styles.colorSwatch} style={{ backgroundColor: wallet.color }} />
                    <div className={styles.walletActions}>
                      {!wallet.is_default && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetDefault(wallet)}>
                          Set default
                        </Button>
                      )}
                      <Button variant="danger" size="sm" onClick={() => setDeletingWallet(wallet)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <AppFooter />

      {deletingWallet && (
        <ConfirmDialog
          title="Delete wallet"
          message={`Delete "${deletingWallet.name}"? Transactions will keep their data but lose the wallet link.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingWallet(null)}
          loading={deleteLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
