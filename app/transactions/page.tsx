'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import FormLabel from '@/components/ui/FormLabel';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
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

function formatDayHeader(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

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

  // Edit dialog
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();

  // Toast
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
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
      setTransactions((txRes.data as RawTransaction[]).map(t => ({
        ...t,
        labels: t.labels.map(l => l.label).filter((l): l is NonNullable<typeof l> => l !== null),
      })));
    }
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (walletRes.data) setWallets(walletRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    window.addEventListener('transaction-added', fetchAll);
    return () => window.removeEventListener('transaction-added', fetchAll);
  }, [fetchAll]);

  const filteredTransactions = transactions.filter(t => {
    if (filterType && t.type !== filterType) return false;
    if (filterCategoryId && t.category_id !== filterCategoryId) return false;
    if (filterLabelId && !t.labels?.some(l => l.id === filterLabelId)) return false;
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

  const groupedDays = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filteredTransactions) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, txs]) => ({
        date,
        transactions: [...txs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        net: txs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0)
           - txs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0),
      }));
  }, [filteredTransactions]);

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (editingTransaction) {
      const { error } = await supabase
        .from('transactions')
        .update({
          type: data.type,
          amount: data.amount,
          wallet_id: data.wallet_id,
          category_id: data.category_id,
          date: data.date,
          notes: data.notes || null,
          payer: data.payer || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTransaction.id);
      if (error) throw error;

      await supabase.from('transaction_labels').delete().eq('transaction_id', editingTransaction.id);
      if (data.label_ids.length > 0) {
        await supabase.from('transaction_labels').insert(
          data.label_ids.map(lid => ({ transaction_id: editingTransaction.id, label_id: lid }))
        );
      }
      setToast({ message: 'Transaction updated.', variant: 'success' });
    } else {
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
          payer: data.payer || null,
        })
        .select()
        .single();
      if (error) throw error;

      if (data.label_ids.length > 0 && inserted) {
        await supabase.from('transaction_labels').insert(
          data.label_ids.map(lid => ({ transaction_id: inserted.id, label_id: lid }))
        );
      }
      setToast({ message: 'Transaction added.', variant: 'success' });
    }

    setEditingTransaction(undefined);
    await fetchAll();
  }

  async function handleDelete() {
    if (!editingTransaction) return;
    const supabase = createClient();
    const { error } = await supabase.from('transactions').delete().eq('id', editingTransaction.id);
    if (error) throw error;
    setToast({ message: 'Transaction deleted.', variant: 'success' });
    setEditingTransaction(undefined);
    await fetchAll();
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Transactions</h1>
          </div>

          {/* Filter bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-type">Type</FormLabel>
              <select
                id="filter-type"
                className={styles.filterSelect}
                value={filterType}
                onChange={e => setFilterType(e.target.value as TransactionType | '')}
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
                onChange={e => setFilterCategoryId(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-label">Label</FormLabel>
              <select
                id="filter-label"
                className={styles.filterSelect}
                value={filterLabelId}
                onChange={e => setFilterLabelId(e.target.value)}
              >
                <option value="">All labels</option>
                {labels.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-wallet">Wallet</FormLabel>
              <select
                id="filter-wallet"
                className={styles.filterSelect}
                value={filterWalletId}
                onChange={e => setFilterWalletId(e.target.value)}
              >
                <option value="">All wallets</option>
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
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
                onChange={e => setFilterFrom(e.target.value)}
              />
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-to">To</FormLabel>
              <input
                id="filter-to"
                type="date"
                className={styles.filterInput}
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
              />
            </div>

            <Button variant="secondary" size="sm" onClick={resetFilters} className={styles.resetBtn}>
              Reset
            </Button>
          </div>

          {/* Grouped list */}
          {loading ? (
            <p className={styles.emptyState}>Loading…</p>
          ) : groupedDays.length === 0 ? (
            <p className={styles.emptyState}>No transactions found.</p>
          ) : (
            <div className={styles.groupedList}>
              {groupedDays.map(({ date, transactions: dayTxs, net }) => (
                <div key={date} className={styles.dayGroup}>
                  <div className={styles.dayHeader}>
                    <span className={styles.dayDate}>{formatDayHeader(date)}</span>
                    <span className={[styles.dayNet, net >= 0 ? styles.dayNetPos : styles.dayNetNeg].join(' ')}>
                      {net < 0 ? '−' : ''}{formatCurrency(Math.abs(net), dayTxs[0]?.wallet?.currency ?? 'HUF')}
                    </span>
                  </div>
                  <div className={styles.dayTxList}>
                    {dayTxs.map(t => {
                      const isTransfer = !!t.transfer_group_id;
                      return (
                        <div key={t.id} className={styles.txRow}>
                          <div
                            className={styles.txIcon}
                            style={{ backgroundColor: isTransfer ? 'var(--color-accent-light)' : (t.category?.color ?? '#94a3b8') + '22' }}
                          >
                            {isTransfer ? '↔' : (t.category?.icon ?? '?')}
                          </div>
                          <div className={styles.txMain}>
                            <span className={styles.txCategory}>
                              {isTransfer
                                ? (t.type === 'expense' ? 'Transfer out' : 'Transfer in')
                                : (t.category?.name ?? 'Uncategorised')}
                            </span>
                            {t.wallet && (
                              <span className={styles.txWallet}>
                                <span className={styles.txWalletDot} style={{ backgroundColor: t.wallet.color }} />
                                {t.wallet.name}
                              </span>
                            )}
                            {t.notes && (
                              <span className={styles.txNotes}>{t.notes}</span>
                            )}
                          </div>
                          <div className={styles.txRight}>
                            <span className={[
                              styles.txAmount,
                              isTransfer ? styles.txTransfer : t.type === 'income' ? styles.txIncome : styles.txExpense,
                            ].join(' ')}>
                              {isTransfer
                                ? (t.type === 'expense' ? '−' : '+')
                                : (t.type === 'income' ? '' : '−')
                              }{formatCurrency(t.amount, t.wallet?.currency ?? 'HUF')}
                            </span>
                            {!isTransfer && (
                              <button
                                className={styles.txEditBtn}
                                onClick={() => setEditingTransaction(t)}
                                aria-label="Edit transaction"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <AppFooter />

      {editingTransaction && (
        <TransactionForm
          transaction={editingTransaction}
          wallets={wallets}
          categories={categories}
          labels={labels}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditingTransaction(undefined)}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
