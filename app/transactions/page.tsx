'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactSelect from 'react-select';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import FormLabel from '@/components/ui/FormLabel';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import { createClient } from '@/lib/supabase/client';
import { fetchAllTransactions } from '@/lib/supabase/fetchAllTransactions';
import { formatCurrency, formatHUF } from '@/lib/utils';
import { getExchangeRates, toHUF } from '@/lib/exchangeRates';
import type { Transaction, Category, Label, TransactionType, Wallet } from '@/lib/types';
import styles from './page.module.css';

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

  // Exchange rates: date → { EUR: number, USD: number, … } (HUF per 1 unit)
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    const dates = [...new Set(
      transactions
        .filter(t => t.wallet?.currency && t.wallet.currency !== 'HUF')
        .map(t => t.date)
    )];
    if (!dates.length) return;
    Promise.all(dates.map(async d => [d, await getExchangeRates(d)] as const))
      .then(entries => setRatesByDate(prev => {
        const next = { ...prev };
        for (const [d, rates] of entries) next[d] = rates;
        return next;
      }));
  }, [transactions]);

  // Lazy load
  const [displayCount, setDisplayCount] = useState(15);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Edit dialog
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();

  // Toast
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [transactions, catRes, lblRes, walletRes] = await Promise.all([
      fetchAllTransactions(user.id),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
    ]);

    setTransactions(transactions);
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

  const categoryFilterOptions: SelectOption[] = (() => {
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);
    const opts: SelectOption[] = [
      { value: '', label: 'All categories' },
      { value: '__none__', label: '— Uncategorized' },
    ];
    for (const parent of parents) {
      const kids = children.filter(c => c.parent_id === parent.id);
      if (kids.length > 0) {
        for (const child of kids) {
          opts.push({ value: child.id, label: `${child.icon} ${child.name}`, group: `${parent.icon} ${parent.name}` });
        }
      } else {
        opts.push({ value: parent.id, label: `${parent.icon} ${parent.name}` });
      }
    }
    for (const child of children.filter(c => !parents.find(p => p.id === c.parent_id))) {
      opts.push({ value: child.id, label: `${child.icon} ${child.name}` });
    }
    return opts;
  })();

  const filteredTransactions = transactions.filter(t => {
    if (filterType && t.type !== filterType) return false;
    if (filterCategoryId === '__none__') {
      if (t.category_id !== null) return false;
    } else if (filterCategoryId && t.category_id !== filterCategoryId) return false;
    if (filterLabelId && !t.labels?.some(l => l.id === filterLabelId)) return false;
    if (filterWalletId && t.wallet_id !== filterWalletId) return false;
    if (filterFrom && t.date < filterFrom) return false;
    if (filterTo && t.date > filterTo) return false;
    return true;
  });

  useEffect(() => { setDisplayCount(15); }, [filterType, filterCategoryId, filterLabelId, filterWalletId, filterFrom, filterTo]);

  function resetFilters() {
    setFilterType('');
    setFilterCategoryId('');
    setFilterLabelId('');
    setFilterWalletId('');
    setFilterFrom('');
    setFilterTo('');
  }

  const hasMore = filteredTransactions.length > displayCount;
  const visibleTransactions = filteredTransactions.slice(0, displayCount);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setDisplayCount(c => c + 20);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  const groupedDays = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of visibleTransactions) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, txs]) => {
        const rates = ratesByDate[date] ?? {};
        return {
          date,
          transactions: [...txs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
          net: txs.filter(t => t.type === 'income'  && !t.transfer_group_id)
                  .reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, rates), 0)
             - txs.filter(t => t.type === 'expense' && !t.transfer_group_id)
                  .reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, rates), 0),
        };
      });
  }, [visibleTransactions, ratesByDate]);

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
              <ReactSelect<{ value: string; label: string }>
                inputId="filter-type"
                options={[
                  { value: '', label: 'All types' },
                  { value: 'income', label: 'Income' },
                  { value: 'expense', label: 'Expense' },
                ]}
                value={{ value: filterType, label: filterType === 'income' ? 'Income' : filterType === 'expense' ? 'Expense' : 'All types' }}
                onChange={(opt) => setFilterType((opt?.value ?? '') as TransactionType | '')}
                isSearchable={false}
                styles={makeRsStyles('sm')}
                theme={rsTheme}
                menuPosition="fixed"
              />
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-cat">Category</FormLabel>
              <SearchableSelect
                id="filter-cat"
                options={categoryFilterOptions}
                value={filterCategoryId}
                onChange={setFilterCategoryId}
                placeholder="All categories"
              />
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-label">Label</FormLabel>
              {(() => {
                const labelOptions = [
                  { value: '', label: 'All labels' },
                  ...labels.map(l => ({ value: l.id, label: l.name })),
                ];
                return (
                  <ReactSelect<{ value: string; label: string }>
                    inputId="filter-label"
                    options={labelOptions}
                    value={labelOptions.find(o => o.value === filterLabelId) ?? labelOptions[0]}
                    onChange={(opt) => setFilterLabelId(opt?.value ?? '')}
                    isSearchable
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                );
              })()}
            </div>

            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-wallet">Wallet</FormLabel>
              {(() => {
                const walletOptions = [
                  { value: '', label: 'All wallets' },
                  ...wallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name}` })),
                ];
                return (
                  <ReactSelect<{ value: string; label: string }>
                    inputId="filter-wallet"
                    options={walletOptions}
                    value={walletOptions.find(o => o.value === filterWalletId) ?? walletOptions[0]}
                    onChange={(opt) => setFilterWalletId(opt?.value ?? '')}
                    isSearchable
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                );
              })()}
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
                      {net < 0 ? '−' : ''}{formatHUF(Math.abs(net))}
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
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
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
