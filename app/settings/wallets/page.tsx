'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import type { Wallet, Currency } from '@/lib/types';
import styles from './page.module.css';

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];
const CURRENCY_LABELS: Record<Currency, string> = {
  HUF: 'HUF — Hungarian Forint',
  USD: 'USD — US Dollar',
  EUR: 'EUR — Euro',
};

interface EditFields {
  name: string;
  icon: string;
  color: string;
  starting_balance: string;
}

export default function WalletsSettingsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#f26e4d');
  const [startingBalance, setStartingBalance] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({ name: '', icon: '', color: '#f26e4d', starting_balance: '0' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deletingWallet, setDeletingWallet] = useState<Wallet | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchWallets = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('wallets').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    if (data) setWallets(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  function handleCloseAdd() {
    setShowAddDialog(false);
    setName(''); setIcon(''); setColor('#f26e4d'); setCurrency('HUF'); setStartingBalance('0');
    setFormError('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const parsedBalance = parseFloat(startingBalance);
    const { error } = await supabase.from('wallets').insert({
      user_id: user.id, name: name.trim(), currency,
      icon: icon.trim() || '💰', color, is_default: false,
      starting_balance: isNaN(parsedBalance) ? 0 : parsedBalance,
    });
    setSaving(false);
    if (error) { setFormError(error.message); } else {
      handleCloseAdd();
      setToast({ message: 'Wallet added.', variant: 'success' });
      await fetchWallets();
    }
  }

  function startEdit(wallet: Wallet) {
    setEditingId(wallet.id);
    setEditFields({ name: wallet.name, icon: wallet.icon, color: wallet.color, starting_balance: String(wallet.starting_balance) });
    setEditError('');
  }

  async function handleEditSave(wallet: Wallet) {
    setEditError('');
    if (!editFields.name.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    const parsedBalance = parseFloat(editFields.starting_balance);
    const supabase = createClient();
    const { error } = await supabase.from('wallets').update({
      name: editFields.name.trim(), icon: editFields.icon.trim() || '💰', color: editFields.color,
      starting_balance: isNaN(parsedBalance) ? 0 : parsedBalance,
    }).eq('id', wallet.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); } else {
      setEditingId(null);
      setToast({ message: 'Wallet updated.', variant: 'success' });
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
    if (deletingWallet.is_default) {
      setToast({ message: 'The default wallet cannot be deleted.', variant: 'error' });
      setDeletingWallet(null); return;
    }
    if (wallets.length <= 1) {
      setToast({ message: 'You must have at least one wallet.', variant: 'error' });
      setDeletingWallet(null); return;
    }
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('wallets').delete().eq('id', deletingWallet.id);
    setDeleteLoading(false);
    setDeletingWallet(null);
    if (error) { setToast({ message: 'Failed to delete wallet.', variant: 'error' }); }
    else { setToast({ message: 'Wallet deleted.', variant: 'success' }); await fetchWallets(); }
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Wallets</h1>
        <Button variant="primary" size="md" onClick={() => setShowAddDialog(true)}>+ Add wallet</Button>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your wallets</h2>
        {loading ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : wallets.length === 0 ? (
          <p className={styles.emptyState}>No wallets yet. Click &quot;+ Add wallet&quot; to create one.</p>
        ) : (
          <div className={styles.list}>
            {wallets.map(wallet => {
              if (editingId === wallet.id) {
                return (
                  <div key={wallet.id} className={[styles.walletItem, styles.walletItemEditing].join(' ')}>
                    <div className={styles.editRow}>
                      <div className={styles.editFields}>
                        <Input type="text" value={editFields.name} onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))} placeholder="Name" />
                        <NumberInput value={editFields.starting_balance} onChange={v => setEditFields(f => ({ ...f, starting_balance: v }))} placeholder="Starting balance" />
                        <Input type="text" value={editFields.icon} onChange={e => setEditFields(f => ({ ...f, icon: e.target.value }))} placeholder="💰" maxLength={4} style={{ width: 72 }} />
                        <input type="color" className={styles.colorPicker} value={editFields.color} onChange={e => setEditFields(f => ({ ...f, color: e.target.value }))} style={{ width: 52 }} />
                      </div>
                      {editError && <p className={styles.formError}>{editError}</p>}
                      <div className={styles.editActions}>
                        <Button variant="primary" size="sm" onClick={() => handleEditSave(wallet)} loading={editSaving}>Save</Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingId(null)} disabled={editSaving}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={wallet.id} className={styles.walletItem}>
                  <div className={styles.walletIcon} style={{ backgroundColor: wallet.color + '22' }}>
                    <span>{wallet.icon}</span>
                  </div>
                  <div className={styles.walletInfo}>
                    <span className={styles.walletName}>{wallet.name}</span>
                    <span className={styles.walletCurrency}>
                      {wallet.currency}
                      {wallet.starting_balance !== 0 && (
                        <span className={styles.walletStartingBalance}>
                          {' '}· Starting: {wallet.starting_balance > 0 ? '+' : ''}{formatNumber(wallet.starting_balance)}
                        </span>
                      )}
                    </span>
                  </div>
                  {wallet.is_default && <span className={styles.defaultBadge}>Default</span>}
                  <div className={styles.walletActions}>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(wallet)}>Edit</Button>
                    {!wallet.is_default && (
                      <Button variant="ghost" size="sm" onClick={() => handleSetDefault(wallet)}>Set default</Button>
                    )}
                    <Button
                      variant="danger" size="sm"
                      onClick={() => setDeletingWallet(wallet)}
                      disabled={wallet.is_default || wallets.length <= 1}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showAddDialog && (
        <Dialog title="Add wallet" onClose={handleCloseAdd}>
          <form onSubmit={handleAdd} className={styles.form}>
            <div className={styles.field}>
              <FormLabel htmlFor="w-name" required>Name</FormLabel>
              <Input id="w-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Savings" required autoFocus />
            </div>
            <div className={styles.field}>
              <FormLabel htmlFor="w-currency">Currency</FormLabel>
              <select id="w-currency" className={styles.select} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <FormLabel htmlFor="w-balance">Starting balance</FormLabel>
              <NumberInput id="w-balance" value={startingBalance} onChange={setStartingBalance} placeholder="0" />
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <FormLabel htmlFor="w-icon">Icon (emoji)</FormLabel>
                <Input id="w-icon" type="text" value={icon} onChange={e => setIcon(e.target.value)} placeholder="💰" maxLength={4} />
              </div>
              <div className={styles.field}>
                <FormLabel htmlFor="w-color">Color</FormLabel>
                <input id="w-color" type="color" className={styles.colorPicker} value={color} onChange={e => setColor(e.target.value)} />
              </div>
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" type="button" onClick={handleCloseAdd}>Cancel</Button>
              <Button type="submit" variant="primary" size="md" loading={saving}>Add wallet</Button>
            </div>
          </form>
        </Dialog>
      )}

      {deletingWallet && (
        <ConfirmDialog
          title="Delete wallet"
          message={`Delete "${deletingWallet.name}"? Transactions linked to it cannot be deleted while this wallet exists.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingWallet(null)}
          loading={deleteLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
