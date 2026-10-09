'use client';

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import EmojiBox from '@/components/ui/EmojiBox';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import LabelSelect from '@/components/ui/LabelSelect';
import Toast from '@/components/ui/Toast';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import TransactionFilters, {
  EMPTY_FILTERS, TxFilters, hasActiveFilters as filtersActive, matchesFilters, parseFilters,
} from '@/components/transactions/TransactionFilters';
import { useAddRecord } from '@/components/transactions/AddRecordProvider';
import FormLabel from '@/components/ui/FormLabel';
import type { PeriodValue } from '@/components/ui/PeriodPicker';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import { createClient } from '@/lib/supabase/client';
import { fetchTransactions } from '@/lib/supabase/fetchTransactions';
import { formatCurrency } from '@/lib/utils';
import { getExchangeRates, getRatesForTransactions, txToBase } from '@/lib/exchangeRates';
import { useBaseCurrency, useFormatBase } from '@/contexts/BaseCurrencyContext';
import type { Transaction, Category, Label, Wallet } from '@/lib/types';
import styles from './page.module.css';

function formatDayHeader(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultPeriod(): PeriodValue {
  const now = new Date();
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    label: 'This month',
    tab: 'months',
  };
}

// Not '' (the default), so the bulk-edit select doesn't show "Remove category" before a pick.
const BULK_REMOVE_CATEGORY = '__bulk_remove_category__';

export default function TransactionsPage() {
  const baseCurrency = useBaseCurrency();
  const formatBase = useFormatBase();
  const { openAddDialog } = useAddRecord();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialised from sessionStorage so filters survive navigation.
  const [filters, setFilters] = useState<TxFilters>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_tx_filters');
      if (saved) try { return parseFilters(JSON.parse(saved)); } catch { }
    }
    return EMPTY_FILTERS;
  });
  const [filterPeriod, setFilterPeriod] = useState<PeriodValue>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_period');
      if (saved) try { return JSON.parse(saved) as PeriodValue; } catch { }
    }
    return defaultPeriod();
  });

  useEffect(() => {
    sessionStorage.setItem('purrfolio_tx_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    sessionStorage.setItem('purrfolio_period', JSON.stringify(filterPeriod));
  }, [filterPeriod]);

  // Short loading flash on filter change (period changes refetch instead).
  const [isFiltering, setIsFiltering] = useState(false);
  useEffect(() => {
    if (loading) return;
    setIsFiltering(true);
    const t = setTimeout(() => setIsFiltering(false), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const [isPeriodLoading, setIsPeriodLoading] = useState(false);

  // date → base currency per 1 unit of each foreign currency
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});

  const [displayCount, setDisplayCount] = useState(15);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [editingTransferPair, setEditingTransferPair] = useState<Transaction | undefined>();

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'edit' | 'delete' | null>(null);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkLabelIds, setBulkLabelIds] = useState<string[]>([]);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkPayee, setBulkPayee] = useState('');
  const [bulkCategoryTouched, setBulkCategoryTouched] = useState(false);
  const [bulkLabelsTouched, setBulkLabelsTouched] = useState(false);
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const [bulkPayeeTouched, setBulkPayeeTouched] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [transactions, catRes, lblRes, walletRes] = await Promise.all([
      fetchTransactions(user.id, filterPeriod.from, filterPeriod.to),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
    ]);

    // Load rates before rendering so totals don't change after the skeleton.
    const rates = await getRatesForTransactions(transactions, baseCurrency);

    setRatesByDate(prevRates => ({ ...prevRates, ...rates }));
    setTransactions(transactions);
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (walletRes.data) setWallets(walletRes.data);
    setLoading(false);
  }, [filterPeriod, baseCurrency]);

  useEffect(() => {
    setIsPeriodLoading(true);
    fetchAll().finally(() => setIsPeriodLoading(false));
    window.addEventListener('transaction-added', fetchAll);
    return () => window.removeEventListener('transaction-added', fetchAll);
  }, [fetchAll]);

  const categoryOptions: SelectOption[] = (() => {
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);
    const opts: SelectOption[] = [];
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

  const filteredTransactions = transactions.filter(t => matchesFilters(t, filters));

  const hasActiveFilters = filtersActive(filters);

  const summaryIncome = filteredTransactions
    .filter(t => t.type === 'income' && !t.transfer_group_id)
    .reduce((s, t) => s + txToBase(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}, baseCurrency), 0);
  const summaryExpense = filteredTransactions
    .filter(t => t.type === 'expense' && !t.transfer_group_id)
    .reduce((s, t) => s + txToBase(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}, baseCurrency), 0);

  useEffect(() => {
    setDisplayCount(15);
    setSelectedIds(new Set());
  }, [filters, filterPeriod]);

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
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
          net: txs.filter(t => t.type === 'income' && !t.transfer_group_id)
            .reduce((s, t) => s + txToBase(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, rates, baseCurrency), 0)
            - txs.filter(t => t.type === 'expense' && !t.transfer_group_id)
              .reduce((s, t) => s + txToBase(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, rates, baseCurrency), 0),
        };
      });
  }, [visibleTransactions, ratesByDate, baseCurrency]);

  const allVisibleIds = visibleTransactions.map(t => t.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.length > 0 && allVisibleIds.some(id => selectedIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected || someSelected ? new Set() : new Set(allVisibleIds));
  }

  function openBulkEdit() {
    setBulkDate('');
    setBulkCategoryId('');
    setBulkLabelIds([]);
    setBulkNote('');
    setBulkPayee('');
    setBulkCategoryTouched(false);
    setBulkLabelsTouched(false);
    setBulkNoteTouched(false);
    setBulkPayeeTouched(false);
    setBulkAction('edit');
  }

  async function executeBulkAction() {
    if (!bulkAction) return;
    const supabase = createClient();
    const ids = [...selectedIds];
    setIsBulkSaving(true);
    try {
      if (bulkAction === 'delete') {
        const selectedTxs = visibleTransactions.filter(t => selectedIds.has(t.id));
        const transferGroupIds = [...new Set(
          selectedTxs.filter(t => t.transfer_group_id).map(t => t.transfer_group_id!)
        )];
        const regularIds = selectedTxs.filter(t => !t.transfer_group_id).map(t => t.id);
        if (regularIds.length > 0) await supabase.from('transactions').delete().in('id', regularIds);
        for (const gid of transferGroupIds) await supabase.from('transactions').delete().eq('transfer_group_id', gid);
        setToast({ message: `${ids.length} transaction${ids.length !== 1 ? 's' : ''} deleted.`, variant: 'success' });
      } else if (bulkAction === 'edit') {
        const patch: Record<string, unknown> = {};
        if (bulkDate) patch.date = bulkDate;
        if (bulkCategoryTouched) patch.category_id = (bulkCategoryId && bulkCategoryId !== BULK_REMOVE_CATEGORY) ? bulkCategoryId : null;
        if (bulkNoteTouched) patch.notes = bulkNote || null;
        if (bulkPayeeTouched) patch.payer = bulkPayee || null;
        if (Object.keys(patch).length > 0) {
          await supabase.from('transactions').update(patch).in('id', ids);
        }
        if (bulkLabelsTouched) {
          await supabase.from('transaction_labels').delete().in('transaction_id', ids);
          if (bulkLabelIds.length > 0) {
            await supabase.from('transaction_labels').insert(
              ids.flatMap(tid => bulkLabelIds.map(lid => ({ transaction_id: tid, label_id: lid })))
            );
          }
        }
        setToast({ message: `${ids.length} transaction${ids.length !== 1 ? 's' : ''} updated.`, variant: 'success' });
      }
      setSelectedIds(new Set());
      setBulkAction(null);
      await fetchAll();
    } catch {
      setToast({ message: 'Something went wrong.', variant: 'error' });
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const getWalletRate = async (walletId: string, date: string): Promise<number | null> => {
      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet?.currency || wallet.currency === baseCurrency) return null;
      const rates = await getExchangeRates(date, baseCurrency);
      return rates[wallet.currency] ?? null;
    };

    if (editingTransaction) {
      if (data.externalTransfer) {
        if (editingTransaction.transfer_group_id) {
          await supabase.from('transactions').delete().eq('transfer_group_id', editingTransaction.transfer_group_id);
        } else {
          await supabase.from('transactions').delete().eq('id', editingTransaction.id);
        }
        const transferGroupId = crypto.randomUUID();
        const exchangeRate = await getWalletRate(data.wallet_id, data.date);
        const { error } = await supabase.from('transactions').insert({
          user_id: user.id,
          type: data.type,
          amount: data.amount,
          wallet_id: data.wallet_id,
          category_id: null,
          date: data.date,
          notes: data.notes || null,
          payer: data.externalTransfer.account_name,
          transfer_group_id: transferGroupId,
          exchange_rate_to_huf: exchangeRate,
        });
        if (error) throw error;
      } else if (data.transfer) {
        if (editingTransaction.transfer_group_id) {
          await supabase.from('transactions').delete().eq('transfer_group_id', editingTransaction.transfer_group_id);
        } else {
          await supabase.from('transactions').delete().eq('id', editingTransaction.id);
        }
        const transferGroupId = crypto.randomUUID();
        const common = { user_id: user.id, date: data.date, notes: data.notes || null, transfer_group_id: transferGroupId };
        const [expenseRate, incomeRate] = await Promise.all([
          getWalletRate(data.wallet_id, data.date),
          getWalletRate(data.transfer.to_wallet_id, data.date),
        ]);
        const { error } = await supabase.from('transactions').insert([
          { ...common, type: 'expense', amount: data.amount, wallet_id: data.wallet_id, exchange_rate_to_huf: expenseRate },
          { ...common, type: 'income', amount: data.transfer.to_amount, wallet_id: data.transfer.to_wallet_id, exchange_rate_to_huf: incomeRate },
        ]);
        if (error) throw error;
      } else {
        if (editingTransaction.transfer_group_id) {
          const { data: paired } = await supabase
            .from('transactions')
            .select('id')
            .eq('transfer_group_id', editingTransaction.transfer_group_id)
            .neq('id', editingTransaction.id);
          if (paired && paired.length > 0) {
            await supabase.from('transactions').delete().in('id', paired.map((p: { id: string }) => p.id));
          }
        }
        const needsNewRate = data.date !== editingTransaction.date || data.wallet_id !== editingTransaction.wallet_id;
        const exchangeRate = needsNewRate
          ? await getWalletRate(data.wallet_id, data.date)
          : (editingTransaction.exchange_rate_to_huf ?? null);
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
            transfer_group_id: null,
            exchange_rate_to_huf: exchangeRate,
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
      }
      setToast({ message: 'Transaction updated.', variant: 'success' });
    } else {
      if (data.externalTransfer) {
        const transferGroupId = crypto.randomUUID();
        const exchangeRate = await getWalletRate(data.wallet_id, data.date);
        const { error } = await supabase.from('transactions').insert({
          user_id: user.id,
          type: data.type,
          amount: data.amount,
          wallet_id: data.wallet_id,
          category_id: null,
          date: data.date,
          notes: data.notes || null,
          payer: data.externalTransfer.account_name,
          transfer_group_id: transferGroupId,
          exchange_rate_to_huf: exchangeRate,
        });
        if (error) throw error;
      } else if (data.transfer) {
        const transferGroupId = crypto.randomUUID();
        const common = { user_id: user.id, date: data.date, notes: data.notes || null, transfer_group_id: transferGroupId };
        const [expenseRate, incomeRate] = await Promise.all([
          getWalletRate(data.wallet_id, data.date),
          getWalletRate(data.transfer.to_wallet_id, data.date),
        ]);
        const { error } = await supabase.from('transactions').insert([
          { ...common, type: 'expense', amount: data.amount, wallet_id: data.wallet_id, exchange_rate_to_huf: expenseRate },
          { ...common, type: 'income', amount: data.transfer.to_amount, wallet_id: data.transfer.to_wallet_id, exchange_rate_to_huf: incomeRate },
        ]);
        if (error) throw error;
      } else {
        const exchangeRate = await getWalletRate(data.wallet_id, data.date);
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
            exchange_rate_to_huf: exchangeRate,
          })
          .select()
          .single();
        if (error) throw error;

        if (data.label_ids.length > 0 && inserted) {
          await supabase.from('transaction_labels').insert(
            data.label_ids.map(lid => ({ transaction_id: inserted.id, label_id: lid }))
          );
        }
      }
      setToast({ message: 'Transaction added.', variant: 'success' });
    }

    setEditingTransaction(undefined);
    setEditingTransferPair(undefined);
    await fetchAll();
  }

  async function handleDelete() {
    if (!editingTransaction) return;
    const supabase = createClient();
    if (editingTransaction.transfer_group_id) {
      const { error } = await supabase.from('transactions').delete().eq('transfer_group_id', editingTransaction.transfer_group_id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('transactions').delete().eq('id', editingTransaction.id);
      if (error) throw error;
    }
    setToast({ message: 'Transaction deleted.', variant: 'success' });
    setEditingTransaction(undefined);
    setEditingTransferPair(undefined);
    await fetchAll();
  }

  function openEdit(t: Transaction) {
    if (t.transfer_group_id) {
      const allLegs = transactions.filter(tx => tx.transfer_group_id === t.transfer_group_id);
      const expenseLeg = allLegs.find(tx => tx.type === 'expense') ?? t;
      const incomeLeg = allLegs.find(tx => tx.type === 'income');
      setEditingTransaction(expenseLeg);
      setEditingTransferPair(incomeLeg);
    } else {
      setEditingTransaction(t);
      setEditingTransferPair(undefined);
    }
  }

  return (
    <AppShell>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Transactions</h1>
          <Button variant="primary" size="lg" onClick={openAddDialog} className={styles.headerAddBtn}>+ Add transaction</Button>
        </div>

        <TransactionFilters
          filters={filters}
          onChange={setFilters}
          period={filterPeriod}
          onPeriodChange={setFilterPeriod}
          categories={categories}
          wallets={wallets}
          labels={labels}
        />

        <div className={styles.contentArea}>
          {!loading && !isPeriodLoading && (
            <div className={styles.summaryCard}>
              <div className={styles.summaryStat}>
                <span className={styles.summaryLabel}>Transactions</span>
                <span className={styles.summaryValue}>{filteredTransactions.length}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryLabel}>Spent</span>
                <span className={[styles.summaryValue, styles.summaryExpense].join(' ')}>−{formatBase(summaryExpense)}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryLabel}>Received</span>
                <span className={[styles.summaryValue, styles.summaryIncome].join(' ')}>+{formatBase(summaryIncome)}</span>
              </div>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className={styles.selectionBar}>
              <label className={styles.selectionLabel}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className={styles.selectionCheckbox}
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all loaded transactions"
                />
                <span>{selectedIds.size} selected</span>
              </label>
              <div className={styles.bulkActions}>
                {selectedIds.size === 1 ? (() => {
                  const tx = visibleTransactions.find(t => selectedIds.has(t.id));
                  return tx ? (
                    <Button size="sm" variant="secondary" onClick={() => { openEdit(tx); setSelectedIds(new Set()); }}>Edit</Button>
                  ) : null;
                })() : (
                  <>
                    <Button size="sm" variant="secondary" onClick={openBulkEdit}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => setBulkAction('delete')}>Delete</Button>
                  </>
                )}
                <Button size="sm" variant="secondary" onClick={() => setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds))}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </Button>
              </div>
              <button className={styles.selectionClear} onClick={() => setSelectedIds(new Set())} aria-label="Clear selection">✕</button>
            </div>
          )}

          {loading || isPeriodLoading ? (
            <div className={styles.skeletonList}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.skeletonRow} />
              ))}
            </div>
          ) : groupedDays.length === 0 ? (
            <EmptyState
              icon={hasActiveFilters ? '🔍' : '🐾'}
              title="No transactions found"
              hint={hasActiveFilters
                ? 'No records match your current filters.'
                : 'Add your first transaction to get started.'}
              action={hasActiveFilters && (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            />
          ) : (
            <div className={[styles.groupedList, isFiltering ? styles.listFiltering : ''].filter(Boolean).join(' ')}>
              {isFiltering && <div className={styles.filteringBar}><span className={styles.spinner} />Filtering…</div>}
              {groupedDays.map(({ date, transactions: dayTxs, net }) => (
                <div key={date} className={styles.dayGroup}>
                  <div className={styles.dayHeader}>
                    <span className={styles.dayDate}>{formatDayHeader(date)}</span>
                    <span className={[styles.dayNet, net >= 0 ? styles.dayNetPos : styles.dayNetNeg].join(' ')}>
                      {net < 0 ? '−' : '+'}{formatBase(Math.abs(net))}
                    </span>
                  </div>
                  <div className={styles.dayTxList}>
                    {dayTxs.map(t => {
                      const isTransfer = !!t.transfer_group_id;
                      return (
                        <div
                          key={t.id}
                          className={[styles.txRow, selectedIds.has(t.id) ? styles.txRowSelected : ''].filter(Boolean).join(' ')}
                          onClick={() => openEdit(t)}
                        >
                          <div className={styles.txLeft}>
                            <input
                              type="checkbox"
                              className={styles.txCheckbox}
                              checked={selectedIds.has(t.id)}
                              onChange={() => toggleSelect(t.id)}
                              aria-label="Select transaction"
                              onClick={e => e.stopPropagation()}
                            />
                            <EmojiBox
                              emoji={isTransfer ? (t.payer ? (t.type === 'expense' ? '↑' : '↓') : '↔') : (t.category?.icon ?? '?')}
                              color={t.category?.color ?? '#94a3b8'}
                              size="sm"
                              style={isTransfer ? { background: 'var(--color-accent-light)' } : undefined}
                            />
                            <div className={styles.txMain}>
                              <div className={styles.txTopRow}>
                                <span className={styles.txCategory}>
                                  {isTransfer
                                    ? (t.payer ? t.payer : 'Transfer')
                                    : (t.category?.name ?? 'Uncategorised')}
                                </span>
                                {t.labels && t.labels.length > 0 && (
                                  <div className={styles.txLabels}>
                                    {t.labels.map(l => (
                                      <span key={l.id} className={styles.txLabel}>
                                        <span className={styles.txWalletDot} style={{ backgroundColor: l.color }} />
                                        {l.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {(() => {
                                const metaParts = [
                                  t.wallet && (
                                    <span key="wallet" className={styles.txWallet}>
                                      <span className={styles.txWalletDot} style={{ backgroundColor: t.wallet.color }} />
                                      {t.wallet.name}
                                    </span>
                                  ),
                                  !isTransfer && t.payer && (
                                    <span key="payer" className={styles.txPayee}>{t.payer}</span>
                                  ),
                                  t.notes && (
                                    <span key="notes" className={styles.txNotes}>{t.notes}</span>
                                  ),
                                ].filter(Boolean);
                                if (metaParts.length === 0) return null;
                                return (
                                  <div className={styles.txMetaRow}>
                                    {metaParts.map((part, i) => (
                                      <Fragment key={i}>
                                        {i > 0 && <span className={[styles.txMetaDot, (part as { key?: string }).key === 'notes' ? styles.txMetaDotNotes : ''].filter(Boolean).join(' ')}>·</span>}
                                        {part}
                                      </Fragment>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className={styles.txRight}>
                            <span className={[
                              styles.txAmount,
                              isTransfer ? styles.txTransfer : t.type === 'income' ? styles.txIncome : styles.txExpense,
                            ].join(' ')}>
                              {t.type === 'income' ? '+' : '−'}{formatCurrency(t.amount, t.wallet?.currency ?? baseCurrency)}
                            </span>
                          </div>

                          {t.notes && <p className={styles.txNotesRow}>{t.notes}</p>}
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
      </div>

      {editingTransaction && (
        <TransactionForm
          transaction={editingTransaction}
          transferPair={editingTransferPair}
          wallets={wallets}
          categories={categories}
          labels={labels}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setEditingTransaction(undefined); setEditingTransferPair(undefined); }}
        />
      )}

      {bulkAction === 'edit' && (
        <Dialog
          title={`Edit ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}`}
          onClose={() => setBulkAction(null)}
          maxWidth={700}
        >
          <div className={styles.bulkColumns}>
            <div className={styles.bulkCol}>
              <div className={styles.bulkField}>
                <FormLabel htmlFor="bulk-date">Date</FormLabel>
                <Input id="bulk-date" type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
              </div>
              <div className={styles.bulkField}>
                <FormLabel htmlFor="bulk-category">Category</FormLabel>
                <SearchableSelect
                  id="bulk-category"
                  options={[{ value: BULK_REMOVE_CATEGORY, label: '— Remove category' }, ...categoryOptions]}
                  value={bulkCategoryId}
                  onChange={value => { setBulkCategoryId(value); setBulkCategoryTouched(true); }}
                  placeholder="Leave unchanged"
                />
              </div>
              <div className={styles.bulkField}>
                <FormLabel>Labels</FormLabel>
                <LabelSelect labels={labels} selectedIds={bulkLabelIds} onChange={value => { setBulkLabelIds(value); setBulkLabelsTouched(true); }} />
              </div>
            </div>
            <div className={styles.bulkCol}>
              <p className={styles.bulkColTitle}>Other details</p>
              <div className={styles.bulkField}>
                <FormLabel htmlFor="bulk-note">Note</FormLabel>
                <textarea
                  id="bulk-note"
                  className={styles.bulkTextarea}
                  rows={4}
                  placeholder="Leave unchanged"
                  value={bulkNote}
                  onChange={e => { setBulkNote(e.target.value); setBulkNoteTouched(true); }}
                />
              </div>
              <div className={styles.bulkField}>
                <FormLabel htmlFor="bulk-payee">Payee</FormLabel>
                <Input id="bulk-payee" type="text" value={bulkPayee} onChange={e => { setBulkPayee(e.target.value); setBulkPayeeTouched(true); }} placeholder="Leave unchanged" />
              </div>
            </div>
          </div>
          <div className={styles.bulkDialogActions}>
            <Button variant="secondary" onClick={() => setBulkAction(null)}>Cancel</Button>
            <Button variant="primary" loading={isBulkSaving} onClick={executeBulkAction}>
              Apply to {selectedIds.size}
            </Button>
          </div>
        </Dialog>
      )}

      {bulkAction === 'delete' && (
        <Dialog
          title={`Delete ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}?`}
          onClose={() => setBulkAction(null)}
        >
          <p className={styles.bulkDeleteWarning}>
            This will permanently delete {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}. Transfer pairs will be deleted in full.
          </p>
          <div className={styles.bulkDialogActions}>
            <Button variant="secondary" onClick={() => setBulkAction(null)}>Cancel</Button>
            <Button variant="danger" loading={isBulkSaving} onClick={executeBulkAction}>Delete</Button>
          </div>
        </Dialog>
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </AppShell>
  );
}
