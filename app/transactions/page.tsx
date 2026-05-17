'use client';

import { useEffect, useState, useCallback } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import TransactionItem from '@/components/transactions/TransactionItem';
import FormLabel from '@/components/ui/FormLabel';
import { createClient } from '@/lib/supabase/client';
import type { Transaction, Category, Label, TransactionType, Wallet } from '@/lib/types';
import styles from './page.module.css';

type RawTransactionLabel = {
  label: {
    id: string;
    user_id: string;
    name: string;
    color: string;
    created_at: string;
  } | null;
};

type RawTransaction = Omit<Transaction, 'labels'> & {
  wallet: Wallet | null;
  category: Transaction['category'];
  labels: RawTransactionLabel[];
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterLabelId, setFilterLabelId] = useState('');
  const [filterWalletId, setFilterWalletId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>(
    undefined
  );

  // Delete state
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [txRes, catRes, lblRes, walletRes] = await Promise.all([
      supabase
        .from('transactions')
        .select(`*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))`)
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
    ]);

    if (txRes.data) {
      const normalized: Transaction[] = (txRes.data as RawTransaction[]).map((t) => ({
        ...t,
        labels: t.labels
          .map((l) => l.label)
          .filter((l): l is NonNullable<typeof l> => l !== null),
      }));
      setTransactions(normalized);
    }
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (walletRes.data) setWallets(walletRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredTransactions = transactions.filter((t) => {
    if (filterType && t.type !== filterType) return false;
    if (filterCategoryId && t.category_id !== filterCategoryId) return false;
    if (filterLabelId && !t.labels?.some((l) => l.id === filterLabelId)) return false;
    if (filterWalletId && t.wallet_id !== filterWalletId) return false;
    if (filterFrom && t.date < filterFrom) return false;
    if (filterTo && t.date > filterTo) return false;
    return true;
  });

  function resetFilters() {
    setFilterType('');
    setFilterCategoryId('');
    setFilterLabelId('');
    setFilterWalletId('');
    setFilterFrom('');
    setFilterTo('');
  }

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (editingTransaction) {
      // Update
      const { error } = await supabase
        .from('transactions')
        .update({
          type: data.type,
          amount: data.amount,
          wallet_id: data.wallet_id,
          category_id: data.category_id,
          date: data.date,
          notes: data.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTransaction.id);

      if (error) throw error;

      // Re-insert labels
      await supabase
        .from('transaction_labels')
        .delete()
        .eq('transaction_id', editingTransaction.id);

      if (data.label_ids.length > 0) {
        await supabase.from('transaction_labels').insert(
          data.label_ids.map((lid) => ({
            transaction_id: editingTransaction.id,
            label_id: lid,
          }))
        );
      }

      setToast({ message: 'Transaction updated.', variant: 'success' });
    } else {
      // Insert
      const { data: inserted, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: data.type,
          amount: data.amount,
          wallet_id: data.wallet_id,
          category_id: data.category_id,
          date: data.date,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      if (data.label_ids.length > 0 && inserted) {
        await supabase.from('transaction_labels').insert(
          data.label_ids.map((lid) => ({
            transaction_id: inserted.id,
            label_id: lid,
          }))
        );
      }

      setToast({ message: 'Transaction added.', variant: 'success' });
    }

    setShowForm(false);
    setEditingTransaction(undefined);
    await fetchAll();
  }

  function openAdd() {
    setEditingTransaction(undefined);
    setShowForm(true);
  }

  function openEdit(t: Transaction) {
    setEditingTransaction(t);
    setShowForm(true);
  }

  async function handleDelete() {
    if (!deletingTransaction) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', deletingTransaction.id);

    setDeleteLoading(false);
    setDeletingTransaction(null);

    if (error) {
      setToast({ message: 'Failed to delete transaction.', variant: 'error' });
    } else {
      setToast({ message: 'Transaction deleted.', variant: 'success' });
      await fetchAll();
    }
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Transactions</h1>
            <Button variant="primary" size="md" onClick={openAdd}>
              + Add transaction
            </Button>
          </div>

          {/* Filter bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-type">Type</FormLabel>
              <select
                id="filter-type"
                className={styles.filterSelect}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as TransactionType | '')}
              >
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-cat">Category</FormLabel>
              <select
                id="filter-cat"
                className={styles.filterSelect}
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-label">Label</FormLabel>
              <select
                id="filter-label"
                className={styles.filterSelect}
                value={filterLabelId}
                onChange={(e) => setFilterLabelId(e.target.value)}
              >
                <option value="">All labels</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-wallet">Wallet</FormLabel>
              <select
                id="filter-wallet"
                className={styles.filterSelect}
                value={filterWalletId}
                onChange={(e) => setFilterWalletId(e.target.value)}
              >
                <option value="">All wallets</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.icon} {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-from">From</FormLabel>
              <input
                id="filter-from"
                type="date"
                className={styles.filterInput}
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-to">To</FormLabel>
              <input
                id="filter-to"
                type="date"
                className={styles.filterInput}
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>

            <Button variant="secondary" size="sm" onClick={resetFilters} className={styles.resetBtn}>
              Reset
            </Button>
          </div>

          {/* List */}
          {loading ? (
            <p className={styles.emptyState}>Loading…</p>
          ) : filteredTransactions.length === 0 ? (
            <p className={styles.emptyState}>No transactions found.</p>
          ) : (
            <div className={styles.list}>
              {filteredTransactions.map((t) => (
                <TransactionItem
                  key={t.id}
                  transaction={t}
                  onEdit={openEdit}
                  onDelete={(tx) => setDeletingTransaction(tx)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <AppFooter />

      {showForm && (
        <TransactionForm
          transaction={editingTransaction}
          wallets={wallets}
          categories={categories}
          labels={labels}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingTransaction(undefined);
          }}
        />
      )}

      {deletingTransaction && (
        <ConfirmDialog
          title="Delete transaction"
          message="Are you sure you want to delete this transaction? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeletingTransaction(null)}
          loading={deleteLoading}
        />
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      )}
    </div>
  );
}
