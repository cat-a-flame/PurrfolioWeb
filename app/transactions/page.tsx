'use client';

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactSelect from 'react-select';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import LabelSelect from '@/components/ui/LabelSelect';
import Toast from '@/components/ui/Toast';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import FormLabel from '@/components/ui/FormLabel';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import { createClient } from '@/lib/supabase/client';
import { fetchTransactions } from '@/lib/supabase/fetchTransactions';
import { formatCurrency, formatHUF } from '@/lib/utils';
import { getExchangeRates, txToHUF } from '@/lib/exchangeRates';
import type { Transaction, Category, Label, TransactionType, Wallet } from '@/lib/types';
import styles from './page.module.css';

type FilterType = TransactionType | 'transfer' | '';

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

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters — initialised from sessionStorage so state persists across navigation
  const [filterType, setFilterType] = useState<FilterType>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_tx_filters');
      if (saved) try { return (JSON.parse(saved).type ?? '') as FilterType; } catch { }
    }
    return '';
  });
  const [filterCategoryId, setFilterCategoryId] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_tx_filters');
      if (saved) try { return JSON.parse(saved).categoryId ?? ''; } catch { }
    }
    return '';
  });
  const [filterLabelId, setFilterLabelId] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_tx_filters');
      if (saved) try { return JSON.parse(saved).labelId ?? ''; } catch { }
    }
    return '';
  });
  const [filterWalletId, setFilterWalletId] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_tx_filters');
      if (saved) try { return JSON.parse(saved).walletId ?? ''; } catch { }
    }
    return '';
  });
  const [filterPeriod, setFilterPeriod] = useState<PeriodValue>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_period');
      if (saved) try { return JSON.parse(saved) as PeriodValue; } catch { }
    }
    return defaultPeriod();
  });
  const [filterSearch, setFilterSearch] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_tx_filters');
      if (saved) try { return JSON.parse(saved).search ?? ''; } catch { }
    }
    return '';
  });

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('purrfolio_tx_filters', JSON.stringify({
      type: filterType,
      categoryId: filterCategoryId,
      labelId: filterLabelId,
      walletId: filterWalletId,
      search: filterSearch,
    }));
  }, [filterType, filterCategoryId, filterLabelId, filterWalletId, filterSearch]);

  useEffect(() => {
    sessionStorage.setItem('purrfolio_period', JSON.stringify(filterPeriod));
  }, [filterPeriod]);

  // Brief loading indicator whenever a filter changes
  const [isFiltering, setIsFiltering] = useState(false);
  useEffect(() => {
    if (loading) return;
    setIsFiltering(true);
    const t = setTimeout(() => setIsFiltering(false), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterCategoryId, filterLabelId, filterWalletId, filterPeriod, filterSearch]);

  // Exchange rates: date → { EUR: number, USD: number, … } (HUF per 1 unit)
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    const dates = [...new Set(
      transactions
        .filter(t => t.wallet?.currency && t.wallet.currency !== 'HUF' && t.exchange_rate_to_huf == null)
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
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [editingTransferPair, setEditingTransferPair] = useState<Transaction | undefined>();

  // Toast
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  // Multi-select & bulk edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'edit' | 'delete' | null>(null);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkLabelIds, setBulkLabelIds] = useState<string[]>([]);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkPayee, setBulkPayee] = useState('');
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

    setTransactions(transactions);
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (walletRes.data) setWallets(walletRes.data);
    setLoading(false);
  }, [filterPeriod]);

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
    if (filterType === 'transfer') {
      if (!t.transfer_group_id) return false;
    } else if (filterType) {
      if (t.type !== filterType || t.transfer_group_id) return false;
    }
    if (filterCategoryId === '__none__') {
      if (t.category_id !== null || t.transfer_group_id) return false;
    } else if (filterCategoryId && t.category_id !== filterCategoryId) return false;
    if (filterLabelId && !t.labels?.some(l => l.id === filterLabelId)) return false;
    if (filterWalletId && t.wallet_id !== filterWalletId) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const matchesNotes = t.notes?.toLowerCase().includes(q);
      const matchesPayer = t.payer?.toLowerCase().includes(q);
      if (!matchesNotes && !matchesPayer) return false;
    }
    return true;
  });

  const hasActiveFilters = !!(filterType || filterCategoryId || filterLabelId || filterWalletId || filterSearch);

  const summaryIncome = filteredTransactions
    .filter(t => t.type === 'income' && !t.transfer_group_id)
    .reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0);
  const summaryExpense = filteredTransactions
    .filter(t => t.type === 'expense' && !t.transfer_group_id)
    .reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0);
  const summaryBalance = summaryIncome - summaryExpense;
  const summaryTotal = summaryIncome + summaryExpense;
  const summaryIncomePct = summaryTotal > 0 ? (summaryIncome / summaryTotal) * 100 : 0;
  const summaryExpensePct = summaryTotal > 0 ? (summaryExpense / summaryTotal) * 100 : 0;

  const showIncome = filterType !== 'expense' && filterType !== 'transfer';
  const showExpense = filterType !== 'income' && filterType !== 'transfer';
  const showBalance = filterType === '' || filterType === undefined;

  useEffect(() => {
    setDisplayCount(15);
    setSelectedIds(new Set());
  }, [filterType, filterCategoryId, filterLabelId, filterWalletId, filterPeriod, filterSearch]);

  function resetFilters() {
    setFilterType('');
    setFilterCategoryId('');
    setFilterLabelId('');
    setFilterWalletId('');
    setFilterSearch('');
    sessionStorage.removeItem('purrfolio_tx_filters');
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
            .reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, rates), 0)
            - txs.filter(t => t.type === 'expense' && !t.transfer_group_id)
              .reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, rates), 0),
        };
      });
  }, [visibleTransactions, ratesByDate]);

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
        const patch: Record<string, unknown> = {
          category_id: bulkCategoryId || null,
          notes: bulkNote || null,
          payer: bulkPayee || null,
        };
        if (bulkDate) patch.date = bulkDate;
        await supabase.from('transactions').update(patch).in('id', ids);
        await supabase.from('transaction_labels').delete().in('transaction_id', ids);
        if (bulkLabelIds.length > 0) {
          await supabase.from('transaction_labels').insert(
            ids.flatMap(tid => bulkLabelIds.map(lid => ({ transaction_id: tid, label_id: lid })))
          );
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
      if (!wallet?.currency || wallet.currency === 'HUF') return null;
      const rates = await getExchangeRates(date);
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

  const typeOptions = [
    { value: '', label: 'All types' },
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'transfer', label: 'Transfer' },
  ];

  return (
    <AppShell>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Transactions</h1>
        </div>

        <div className={styles.bodyLayout}>
          {/* ── Filter sidebar ── */}
          <aside className={styles.filterSidebar}>
            <p className={styles.filterSidebarTitle}>Filters</p>

            {/* Type */}
            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-type">Type</FormLabel>
              <ReactSelect<{ value: string; label: string }>
                inputId="filter-type"
                options={typeOptions}
                value={typeOptions.find(o => o.value === filterType) ?? typeOptions[0]}
                onChange={(opt) => setFilterType((opt?.value ?? '') as FilterType)}
                isSearchable={false}
                styles={makeRsStyles('sm')}
                theme={rsTheme}
                menuPosition="fixed"
              />
            </div>

            {/* Category */}
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

            {/* Label */}
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

            {/* Wallet */}
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

            {/* Notes / payee search */}
            <div className={styles.filterField}>
              <FormLabel htmlFor="filter-search">Search notes & payee</FormLabel>
              <div className={styles.searchWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  id="filter-search"
                  type="search"
                  className={styles.searchInput}
                  placeholder="Search in notes or payee…"
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                />
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={resetFilters} className={styles.resetBtn}>
              Reset
            </Button>
          </aside>

          {/* ── Content ── */}
          <div className={styles.contentArea}>
            {/* ── Cash flow summary ── */}
            {!loading && filteredTransactions.length > 0 && filterType !== 'transfer' && (
              <div className={styles.summaryCard}>
                {showBalance && (
                  <div className={styles.summaryBalance}>
                    <span className={styles.summaryBalanceLabel}>Balance</span>
                    <span className={styles.summaryBalanceAmount}>
                      {summaryBalance < 0 ? '−' : ''}{formatHUF(Math.abs(summaryBalance))}
                    </span>
                  </div>
                )}
                <div className={styles.summaryBars}>
                  {showIncome && (
                    <div className={styles.summaryBarRow}>
                      <div className={styles.summaryBarMeta}>
                        <span className={styles.summaryBarLabel}>Income</span>
                        <span className={[styles.summaryBarAmount, styles.summaryIncomeAmount].join(' ')}>{formatHUF(summaryIncome)}</span>
                      </div>
                      {showBalance && (
                        <div className={styles.summaryBarTrack}>
                          <div className={[styles.summaryBarFill, styles.summaryBarFillIncome].join(' ')} style={{ width: `${summaryIncomePct}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                  {showExpense && (
                    <div className={styles.summaryBarRow}>
                      <div className={styles.summaryBarMeta}>
                        <span className={styles.summaryBarLabel}>Expense</span>
                        <span className={[styles.summaryBarAmount, styles.summaryExpenseAmount].join(' ')}>−{formatHUF(summaryExpense)}</span>
                      </div>
                      {showBalance && (
                        <div className={styles.summaryBarTrack}>
                          <div className={[styles.summaryBarFill, styles.summaryBarFillExpense].join(' ')} style={{ width: `${summaryExpensePct}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={styles.periodRow}>
              <PeriodPicker value={filterPeriod} onChange={setFilterPeriod} />
            </div>

            {/* ── Selection bar ── */}
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

            {loading ? (
              <div className={styles.skeletonList}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={styles.skeletonRow} />
                ))}
              </div>
            ) : groupedDays.length === 0 ? (
              <div className={styles.emptyStateCard}>
                <span className={styles.emptyIcon}>🔍</span>
                <p className={styles.emptyTitle}>No transactions found</p>
                <p className={styles.emptyHint}>
                  {hasActiveFilters
                    ? 'No records match your current filters.'
                    : 'Add your first transaction to get started.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className={[styles.groupedList, isFiltering ? styles.listFiltering : ''].filter(Boolean).join(' ')}>
                {isFiltering && <div className={styles.filteringBar}><span className={styles.spinner} />Filtering…</div>}
                {groupedDays.map(({ date, transactions: dayTxs, net }) => (
                  <div key={date} className={styles.dayGroup}>
                    <div className={styles.dayHeader}>
                      <span className={styles.dayDate}>{formatDayHeader(date)}</span>
                      <span className={[styles.dayNet, net >= 0 ? styles.dayNetPos : styles.dayNetNeg].join(' ')}>
                        {net < 0 ? '−' : '+'}{formatHUF(Math.abs(net))}
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
                              <div
                                className={styles.txIcon}
                                style={{ backgroundColor: isTransfer ? 'var(--color-accent-light)' : (t.category?.color ?? '#94a3b8') + '22' }}
                              >
                                {isTransfer ? (t.payer ? (t.type === 'expense' ? '↑' : '↓') : '↔') : (t.category?.icon ?? '?')}
                              </div>
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
                                          {i > 0 && <span className={styles.txMetaDot}>·</span>}
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
                                {t.type === 'income' ? '+' : '−'}{formatCurrency(t.amount, t.wallet?.currency ?? 'HUF')}
                              </span>
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

      {/* ── Bulk edit dialog ── */}
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
                  options={[{ value: '', label: '— Remove category' }, ...categoryFilterOptions.filter(o => o.value !== '' && o.value !== '__none__')]}
                  value={bulkCategoryId}
                  onChange={setBulkCategoryId}
                  placeholder="Choose category"
                />
              </div>
              <div className={styles.bulkField}>
                <FormLabel>Labels</FormLabel>
                <LabelSelect labels={labels} selectedIds={bulkLabelIds} onChange={setBulkLabelIds} />
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
                  placeholder="Leave empty to clear"
                  value={bulkNote}
                  onChange={e => setBulkNote(e.target.value)}
                />
              </div>
              <div className={styles.bulkField}>
                <FormLabel htmlFor="bulk-payee">Payee</FormLabel>
                <Input id="bulk-payee" type="text" value={bulkPayee} onChange={e => setBulkPayee(e.target.value)} placeholder="Leave empty to clear" />
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

      {/* ── Bulk delete confirm ── */}
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
