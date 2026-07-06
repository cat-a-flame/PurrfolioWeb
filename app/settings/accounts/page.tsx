'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import AccountCard from '@/components/accounts/AccountCard';
import AccountEditorModal, { type WalletDraft } from '@/components/accounts/AccountEditorModal';
import { createClient } from '@/lib/supabase/client';
import type { Wallet } from '@/lib/types';
import styles from './page.module.css';

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; wallet: Wallet };

const DEFAULT_COLOR = '#7a5ce0';

export default function AccountsSettingsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  const activeWallets = wallets.filter(w => !w.is_archived);
  const archivedWallets = wallets.filter(w => w.is_archived);

  function openCreate() { setModal({ mode: 'create' }); }
  function openEdit(wallet: Wallet) { setModal({ mode: 'edit', wallet }); }
  function closeModal() { setModal(null); }

  async function handleSave(draft: WalletDraft) {
    if (!modal) return;
    const supabase = createClient();
    const name = draft.name.trim() || 'Untitled';
    const icon = draft.icon.trim() || '💰';
    const parsedBalance = parseFloat(draft.startingBalance);
    const startingBalance = isNaN(parsedBalance) ? 0 : parsedBalance;
    setSaving(true);

    if (modal.mode === 'create') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { error } = await supabase.from('wallets').insert({
        user_id: user.id, name, currency: draft.currency, icon, color: draft.color,
        is_default: false, starting_balance: startingBalance,
      });

      setSaving(false);
      if (error) {
        setToast({ message: 'Failed to create account.', variant: 'error' });
        return;
      }
      setModal(null);
      setToast({ message: 'Account created', variant: 'success' });
      fetchWallets();
      return;
    }

    const { error } = await supabase.from('wallets')
      .update({ name, icon, color: draft.color, starting_balance: startingBalance })
      .eq('id', modal.wallet.id);

    setSaving(false);
    if (error) {
      setToast({ message: 'Failed to save account.', variant: 'error' });
      return;
    }
    setModal(null);
    setToast({ message: 'Changes saved', variant: 'success' });
    fetchWallets();
  }

  async function handleSetDefault() {
    if (modal?.mode !== 'edit') return;
    const wallet = modal.wallet;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('wallets').update({ is_default: true }).eq('id', wallet.id);
    setModal(null);
    setToast({ message: `"${wallet.name}" set as default.`, variant: 'success' });
    fetchWallets();
  }

  async function handleToggleArchive() {
    if (modal?.mode !== 'edit') return;
    const wallet = modal.wallet;
    if (!wallet.is_archived && wallet.is_default) {
      setToast({ message: 'The default account cannot be archived.', variant: 'error' });
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from('wallets')
      .update({ is_archived: !wallet.is_archived })
      .eq('id', wallet.id);
    if (error) {
      setToast({ message: 'Failed to update account.', variant: 'error' });
      return;
    }
    setModal(null);
    setToast({ message: wallet.is_archived ? `"${wallet.name}" unarchived.` : `"${wallet.name}" archived.`, variant: 'success' });
    fetchWallets();
  }

  function requestDelete() {
    if (modal?.mode !== 'edit') return;
    setConfirmDelete({ id: modal.wallet.id, name: modal.wallet.name });
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const wallet = wallets.find(w => w.id === confirmDelete.id);
    if (wallet?.is_default) {
      setToast({ message: 'The default account cannot be deleted.', variant: 'error' });
      setConfirmDelete(null);
      return;
    }
    if (wallets.length <= 1) {
      setToast({ message: 'You must have at least one account.', variant: 'error' });
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('wallets').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      setToast({ message: 'Failed to delete account.', variant: 'error' });
    } else {
      setModal(null);
      setToast({ message: 'Account deleted', variant: 'success' });
      fetchWallets();
    }
  }

  const draftInitial: WalletDraft | null = !modal ? null : modal.mode === 'create'
    ? { name: '', icon: '💰', color: DEFAULT_COLOR, currency: 'HUF', startingBalance: '0', isDefault: false, isArchived: false }
    : {
      name: modal.wallet.name,
      icon: modal.wallet.icon,
      color: modal.wallet.color,
      currency: modal.wallet.currency,
      startingBalance: String(modal.wallet.starting_balance),
      isDefault: modal.wallet.is_default,
      isArchived: modal.wallet.is_archived,
    };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Track your balances</div>
          <h1 className={styles.title}>Accounts</h1>
        </div>
        <Button variant="primary" size="lg" onClick={openCreate}>+ New account</Button>
      </div>

      {loading ? (
        <p className={styles.emptyState}>Loading…</p>
      ) : activeWallets.length === 0 ? (
        <p className={styles.emptyState}>No accounts yet. Click &quot;+ New account&quot; to create one.</p>
      ) : (
        <div className={styles.grid}>
          {activeWallets.map((w) => (
            <AccountCard key={w.id} wallet={w} onEdit={openEdit} />
          ))}
        </div>
      )}

      {archivedWallets.length > 0 && (
        <div className={styles.archivedSection}>
          <div className={styles.archivedTitle}>Archived accounts</div>
          <div className={styles.grid}>
            {archivedWallets.map((w) => (
              <AccountCard key={w.id} wallet={w} onEdit={openEdit} />
            ))}
          </div>
        </div>
      )}

      {modal && draftInitial && (
        <AccountEditorModal
          mode={modal.mode}
          initial={draftInitial}
          canDelete={modal.mode === 'edit' && !modal.wallet.is_default && !modal.wallet.is_archived && wallets.length > 1}
          saving={saving}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={requestDelete}
          onSetDefault={handleSetDefault}
          onToggleArchive={handleToggleArchive}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message="Transactions linked to this account cannot be deleted while it exists."
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleting}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
