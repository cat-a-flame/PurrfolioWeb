'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCountUp } from '@/lib/useCountUp';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmojiBox from '@/components/ui/EmojiBox';
import EmptyState from '@/components/ui/EmptyState';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import Skeleton from '@/components/ui/Skeleton';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import { useAddRecord } from '@/components/transactions/AddRecordProvider';
import { createClient } from '@/lib/supabase/client';
import { fetchTransactions } from '@/lib/supabase/fetchTransactions';
import { fetchWalletBalanceSums } from '@/lib/supabase/fetchWalletBalanceSums';
import { formatHUF, formatCurrency } from '@/lib/utils';
import { getExchangeRates, txToHUF } from '@/lib/exchangeRates';
import { generateDueDates, frequencyLabel, isoDate } from '@/lib/recurringUtils';
import type { Transaction, Wallet, Category, Label, RecurringPayment, RecurringOccurrence } from '@/lib/types';
import styles from './page.module.css';

function defaultPeriod(): PeriodValue {
  const now = new Date();
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    label: 'This month',
    tab: 'months',
  };
}

function getPrevRange(v: PeriodValue): { from: string; to: string } {
  const f = new Date(v.from + 'T12:00:00');
  const t = new Date(v.to + 'T12:00:00');
  if (v.tab === 'weeks') {
    return {
      from: isoDate(new Date(f.getTime() - 7 * 86400000)),
      to: isoDate(new Date(t.getTime() - 7 * 86400000)),
    };
  }
  if (v.tab === 'months') {
    return {
      from: isoDate(new Date(f.getFullYear(), f.getMonth() - 1, 1)),
      to: isoDate(new Date(f.getFullYear(), f.getMonth(), 0)),
    };
  }
  if (v.tab === 'years') {
    const y = f.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  return {
    from: isoDate(new Date(f.getTime() - days * 86400000)),
    to: isoDate(new Date(f.getTime() - 86400000)),
  };
}

function formatDayLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default function DashboardPage() {
  const { openAddDialog } = useAddRecord();

  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([]);
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([]);
  const [walletBalanceSums, setWalletBalanceSums] = useState<Map<string, { income: number; expense: number }>>(new Map());
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<RecurringOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  // True while a period change is being fetched (distinct from `loading`, which only
  // covers the very first load) — lets us skeleton just the period-dependent cards.
  const [periodLoading, setPeriodLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('purrfolio_period');
      if (saved) try { return JSON.parse(saved) as PeriodValue; } catch {}
    }
    return defaultPeriod();
  });

  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [editingTransferPair, setEditingTransferPair] = useState<Transaction | undefined>();
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const [plannedDialogItem, setPlannedDialogItem] = useState<{ payment: RecurringPayment; dueDate: Date } | undefined>();
  const [plannedActionLoading, setPlannedActionLoading] = useState(false);

  // Cash Flow card's own content sets the row height; the side cards are
  // clamped to match it (with internal scrolling) rather than the reverse.
  const cashFlowRef = useRef<HTMLDivElement>(null);
  const [sideCardHeight, setSideCardHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = cashFlowRef.current;
    if (!el) return;
    const update = () => {
      setSideCardHeight(window.innerWidth <= 768 ? undefined : el.getBoundingClientRect().height);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Exchange rates: date → { EUR: number, USD: number, … } (HUF per 1 unit)
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    const allFetched = [...periodTransactions, ...prevTransactions];
    const dates = [...new Set(
      allFetched
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
  }, [periodTransactions, prevTransactions]);

  useEffect(() => {
    sessionStorage.setItem('purrfolio_period', JSON.stringify(period));
  }, [period]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const prev = getPrevRange(period);
    const [txs, prevTxs, walletSums, walletRes, catRes, lblRes, rpRes, occRes] = await Promise.all([
      fetchTransactions(user.id, period.from, period.to),
      fetchTransactions(user.id, prev.from, prev.to),
      fetchWalletBalanceSums(user.id),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      supabase.from('recurring_payments').select('*, wallet:wallets(*), category:categories(*), labels:recurring_payment_labels(label:labels(*))').eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id).gte('due_date', period.from).lte('due_date', period.to),
    ]);
    setPeriodTransactions(txs);
    setPrevTransactions(prevTxs);
    setWalletBalanceSums(walletSums);
    if (walletRes.data) setWallets(walletRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (rpRes.data) {
      type RawPayment = Omit<RecurringPayment, 'labels'> & { labels: { label: Label | null }[] };
      setRecurringPayments((rpRes.data as RawPayment[]).map(p => ({
        ...p,
        labels: p.labels.map(l => l.label).filter((l): l is Label => l !== null),
      })));
    }
    if (occRes.data) setRecurringOccurrences(occRes.data as RecurringOccurrence[]);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    setPeriodLoading(true);
    fetchData().finally(() => setPeriodLoading(false));
    window.addEventListener('transaction-added', fetchData);
    return () => window.removeEventListener('transaction-added', fetchData);
  }, [fetchData]);

  const income = periodTransactions.filter(t => t.type === 'income' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0);
  const expense = periodTransactions.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0);
  const balance = income - expense;

  const prevBalance = prevTransactions.filter(t => t.type === 'income' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0)
    - prevTransactions.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0);

  const vsPct = prevBalance === 0 ? null : Math.round(((balance - prevBalance) / Math.abs(prevBalance)) * 100);

  const animatedBalance = useCountUp(balance);

  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 0;
  const expensePct = total > 0 ? (expense / total) * 100 : 0;

  const walletSummaries = wallets
    .filter(w => !w.is_archived)
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(wallet => {
      const sums = walletBalanceSums.get(wallet.id) ?? { income: 0, expense: 0 };
      return { wallet, balance: wallet.starting_balance + sums.income - sums.expense };
    });

  // Top expense categories in the selected period, by total spend
  const topCategories = useMemo(() => {
    const totals = new Map<string, { category: Category | null; total: number }>();
    for (const t of periodTransactions) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const key = t.category_id ?? 'uncategorised';
      const amt = txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
      const entry = totals.get(key) ?? { category: t.category ?? null, total: 0 };
      entry.total += amt;
      totals.set(key, entry);
    }
    return Array.from(totals.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [periodTransactions, ratesByDate]);

  // Planned payments due within the selected period that haven't been paid/skipped yet
  const plannedDue = useMemo(() => {
    const actioned = new Set(
      recurringOccurrences
        .filter(o => o.status === 'paid' || o.status === 'skipped')
        .map(o => `${o.recurring_payment_id}|${o.due_date.slice(0, 10)}`)
    );
    const from = new Date(period.from + 'T00:00:00');
    const to = new Date(period.to + 'T00:00:00');
    const items: { payment: RecurringPayment; dueDate: Date }[] = [];
    for (const p of recurringPayments) {
      for (const date of generateDueDates(p, from, to)) {
        const key = `${p.id}|${isoDate(date)}`;
        if (!actioned.has(key)) items.push({ payment: p, dueDate: date });
      }
    }
    return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [recurringPayments, recurringOccurrences, period]);

  // Latest 10 transactions in the selected period
  const recentTransactions = useMemo(() => {
    return [...periodTransactions]
      .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)))
      .slice(0, 10);
  }, [periodTransactions]);

  async function handlePlannedAdd() {
    if (!plannedDialogItem) return;
    const { payment, dueDate } = plannedDialogItem;
    setPlannedActionLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPlannedActionLoading(false); return; }

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: payment.type,
        amount: payment.amount,
        wallet_id: payment.wallet_id,
        category_id: payment.category_id,
        date: isoDate(dueDate),
        notes: payment.notes,
        payer: payment.payer,
      })
      .select('id')
      .single();

    if (txErr || !txData) {
      setToast({ message: 'Failed to create transaction.', variant: 'error' });
      setPlannedActionLoading(false);
      return;
    }

    const { error: occErr } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: payment.id,
      user_id: user.id,
      due_date: isoDate(dueDate),
      status: 'paid',
      transaction_id: txData.id,
    });

    if (occErr) {
      setToast({ message: 'Transaction created but occurrence record failed.', variant: 'error' });
    } else {
      if (payment.labels && payment.labels.length > 0) {
        await supabase.from('transaction_labels').insert(
          payment.labels.map(l => ({ transaction_id: txData.id, label_id: l.id }))
        );
      }
      setToast({ message: `${payment.name} added.`, variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
    }
    setPlannedActionLoading(false);
    setPlannedDialogItem(undefined);
    await fetchData();
  }

  async function handlePlannedSkip() {
    if (!plannedDialogItem) return;
    const { payment, dueDate } = plannedDialogItem;
    setPlannedActionLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPlannedActionLoading(false); return; }

    const { error } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: payment.id,
      user_id: user.id,
      due_date: isoDate(dueDate),
      status: 'skipped',
      transaction_id: null,
    });

    if (error) {
      setToast({ message: 'Failed to skip.', variant: 'error' });
    } else {
      setToast({ message: `${payment.name} skipped.`, variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
    }
    setPlannedActionLoading(false);
    setPlannedDialogItem(undefined);
    await fetchData();
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
    setEditingTransaction(undefined);
    setEditingTransferPair(undefined);
    setToast({ message: 'Transaction deleted.', variant: 'success' });
    await fetchData();
  }

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (!editingTransaction) return;

    const getWalletRate = async (walletId: string, date: string): Promise<number | null> => {
      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet?.currency || wallet.currency === 'HUF') return null;
      const rates = await getExchangeRates(date);
      return rates[wallet.currency] ?? null;
    };

    if (data.externalTransfer) {
      // Delete original record(s)
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
      // Delete original record(s) — both legs if it was already a transfer
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
      // If it was a transfer being converted to a regular transaction, delete the paired leg
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

    setEditingTransaction(undefined);
    setEditingTransferPair(undefined);
    setToast({ message: 'Transaction updated.', variant: 'success' });
    window.dispatchEvent(new Event('transaction-added'));
    await fetchData();
  }

  function openEdit(t: Transaction) {
    if (t.transfer_group_id) {
      const allLegs = periodTransactions.filter(tx => tx.transfer_group_id === t.transfer_group_id);
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
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <Button variant="primary" size="lg" onClick={openAddDialog}>+ Add transaction</Button>
        </div>

        <div className={styles.periodRow}>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        {loading ? (
          <div className={styles.accountsStrip}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.accountTile}>
                <Skeleton width={42} height={42} radius="var(--radius-sm)" />
                <div className={styles.accountInfo}>
                  <Skeleton width={70} height={11} radius={4} style={{ marginBottom: 6 }} />
                  <Skeleton width={90} height={13} radius={4} />
                </div>
              </div>
            ))}
          </div>
        ) : walletSummaries.length > 0 && (
          <div className={styles.accountsStrip}>
            {walletSummaries.map(({ wallet, balance: wb }) => (
              <div key={wallet.id} className={styles.accountTile}>
                <EmojiBox emoji={wallet.icon} color={wallet.color} size="md" />
                <div className={styles.accountInfo}>
                  <span className={styles.accountName}>{wallet.name}</span>
                  <span className={styles.accountBalance}>{formatCurrency(wb, wallet.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.topRow}>
          {/* Cash Flow card */}
          <div className={styles.cashFlowCard} ref={cashFlowRef}>
            <p className={styles.cashFlowTitle}>Cash flow</p>
            {loading || periodLoading ? (
              <>
                <div className={styles.cashFlowTop}>
                  <div className={styles.cashFlowLeft}>
                    <Skeleton variant="light" width={90} height={12} radius={4} style={{ marginBottom: 8 }} />
                    <Skeleton variant="light" width={160} height={30} radius={6} />
                  </div>
                </div>
                <div className={styles.cashFlowBars}>
                  <div className={styles.barRow}>
                    <Skeleton variant="light" width="100%" height={8} radius="var(--radius-full)" />
                  </div>
                  <div className={styles.barRow}>
                    <Skeleton variant="light" width="100%" height={8} radius="var(--radius-full)" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={styles.cashFlowTop}>
                  <div className={styles.cashFlowLeft}>
                    <span className={styles.cashFlowPeriodLabel}>{period.label}</span>
                    <div className={styles.cashFlowBalance}>{formatHUF(animatedBalance)}</div>
                  </div>
                  {vsPct !== null && (
                    <div className={styles.cashFlowRight}>
                      <span className={styles.vsLabel}>vs previous period</span>
                      <span className={[styles.vsTag, vsPct >= 0 ? styles.vsTagPos : styles.vsTagNeg].join(' ')}>
                        {vsPct >= 0 ? '↑' : '↓'} {Math.abs(vsPct)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className={styles.cashFlowBars}>
                  <div className={styles.barRow}>
                    <div className={styles.barMeta}>
                      <span className={styles.barLabel}>Income</span>
                      <span className={styles.barAmount}>{formatHUF(income)}</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={[styles.barFill, styles.barFillIncome].join(' ')} style={{ width: `${incomePct}%` }} />
                    </div>
                  </div>
                  <div className={styles.barRow}>
                    <div className={styles.barMeta}>
                      <span className={styles.barLabel}>Expense</span>
                      <span className={styles.barAmount}>-{formatHUF(expense)}</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={[styles.barFill, styles.barFillExpense].join(' ')} style={{ width: `${expensePct}%` }} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Planned payments card */}
          <div className={styles.sideCard} style={sideCardHeight ? { height: sideCardHeight } : undefined}>
            <div className={styles.sideCardHeader}>
              <h2 className={styles.sideCardTitle}>Planned payments</h2>
              <Link href="/recurring" className={styles.sideCardLink}>All</Link>
            </div>
            {loading || periodLoading ? (
              <div className={styles.sideCardList}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={styles.plannedRow}>
                    <Skeleton width={42} height={42} radius="var(--radius-sm)" />
                    <div className={styles.plannedInfo}>
                      <Skeleton width="70%" height={13} radius={4} style={{ marginBottom: 6 }} />
                      <Skeleton width="40%" height={11} radius={4} />
                    </div>
                  </div>
                ))}
              </div>
            ) : plannedDue.length === 0 ? (
              <div className={styles.sideCardEmptyWrap}>
                <EmptyState compact icon="🎉" hint="Nothing due this period." />
              </div>
            ) : (
              <div className={styles.sideCardList}>
                {plannedDue.map(({ payment, dueDate }, i) => (
                  <div
                    key={`${payment.id}-${i}`}
                    className={styles.plannedRow}
                    onClick={() => setPlannedDialogItem({ payment, dueDate })}
                  >
                    <div className={styles.plannedTile}>
                      <span className={styles.plannedTileMon}>{dueDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                      <span className={styles.plannedTileDay}>{dueDate.getDate()}</span>
                    </div>
                    <div className={styles.plannedInfo}>
                      <span className={styles.plannedName}>{payment.name}</span>
                      <span className={styles.plannedFreq}>{frequencyLabel(payment.frequency)}</span>
                    </div>
                    <span className={[styles.plannedAmount, payment.type === 'income' ? styles.amtIncome : styles.amtExpense].join(' ')}>
                      {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, payment.wallet?.currency ?? 'HUF')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top categories card */}
          <div className={styles.sideCard} style={sideCardHeight ? { height: sideCardHeight } : undefined}>
            <div className={styles.sideCardHeader}>
              <h2 className={styles.sideCardTitle}>Top categories</h2>
              <Link href="/statistics" className={styles.sideCardLink}>All</Link>
            </div>
            {loading || periodLoading ? (
              <div className={styles.sideCardList}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={styles.catRow}>
                    <Skeleton width={38} height={38} radius="var(--radius-sm)" />
                    <div className={styles.catInfo}>
                      <Skeleton width="60%" height={13} radius={4} />
                    </div>
                  </div>
                ))}
              </div>
            ) : topCategories.length === 0 ? (
              <div className={styles.sideCardEmptyWrap}>
                <EmptyState compact icon="🐱" hint="No expenses in this period." />
              </div>
            ) : (
              <div className={styles.sideCardList}>
                {topCategories.map(({ category, total }) => (
                  <div key={category?.id ?? 'uncategorised'} className={styles.catRow}>
                    <EmojiBox emoji={category?.icon ?? '?'} color={category?.color ?? '#94a3b8'} size="sm" />
                    <div className={styles.catInfo}>
                      <span className={styles.catName}>{category?.name ?? 'Uncategorised'}</span>
                    </div>
                    <span className={styles.catAmount}>−{formatHUF(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent transactions */}
        <section className={styles.recentCard}>
          <div className={styles.recentHeader}>
            <h2 className={styles.recentTitle}>Recent transactions</h2>
            <Link href="/transactions" className={styles.recentSeeAll}>View all</Link>
          </div>
          {loading || periodLoading ? (
            <div className={styles.recentList}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.txRow}>
                  <Skeleton width={44} height={44} radius="var(--radius-sm)" />
                  <div className={styles.txMain}>
                    <Skeleton width="45%" height={13} radius={4} style={{ marginBottom: 6 }} />
                    <Skeleton width="65%" height={11} radius={4} />
                  </div>
                  <Skeleton width={60} height={13} radius={4} />
                </div>
              ))}
            </div>
          ) : recentTransactions.length === 0 ? (
            <EmptyState icon="🐾" title="No transactions yet" hint="No transactions in this period." />
          ) : (
            <div className={styles.recentList}>
              {recentTransactions.map(t => {
                const isTransfer = !!t.transfer_group_id;
                return (
                  <div key={t.id} className={styles.txRow} onClick={() => openEdit(t)}>
                    <EmojiBox
                      emoji={isTransfer ? (t.payer ? (t.type === 'expense' ? '↑' : '↓') : '↔') : (t.category?.icon ?? '?')}
                      color={t.category?.color ?? '#94a3b8'}
                      size="md"
                      style={isTransfer ? { background: 'var(--color-accent-light)' } : undefined}
                    />
                    <div className={styles.txMain}>
                      <div className={styles.txTopRow}>
                        <span className={styles.txName}>
                          {isTransfer ? (t.payer ? t.payer : 'Transfer') : (t.category?.name ?? 'Uncategorised')}
                        </span>
                        {t.labels && t.labels.length > 0 && (
                          <div className={styles.txLabels}>
                            {t.labels.map(l => (
                              <span key={l.id} className={styles.txLabel}>
                                <span className={styles.txLabelDot} style={{ backgroundColor: l.color }} />
                                {l.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {(() => {
                        const metaParts = [
                          t.wallet && (
                            <span key="wallet" className={styles.txMeta}>
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

                    <div className={styles.txRight}>
                      <span className={[
                        styles.txAmount,
                        isTransfer ? styles.txTransfer : t.type === 'income' ? styles.amtIncome : styles.amtExpense,
                      ].join(' ')}>
                        {t.type === 'income' ? '+' : '−'}{formatCurrency(t.amount, t.wallet?.currency ?? 'HUF')}
                      </span>
                      <span className={styles.txDate}>{formatDayLabel(t.date)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {editingTransaction && (
        <TransactionForm
          wallets={wallets}
          categories={categories}
          labels={labels}
          transaction={editingTransaction}
          transferPair={editingTransferPair}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setEditingTransaction(undefined); setEditingTransferPair(undefined); }}
        />
      )}

      {plannedDialogItem && (
        <ConfirmDialog
          title={plannedDialogItem.payment.name}
          message={
            <>
              <span className={[
                styles.plannedDialogAmount,
                plannedDialogItem.payment.type === 'income' ? styles.amtIncome : styles.amtExpense,
              ].join(' ')}>
                {plannedDialogItem.payment.type === 'income' ? '+' : '−'}
                {formatCurrency(plannedDialogItem.payment.amount, plannedDialogItem.payment.wallet?.currency ?? 'HUF')}
              </span>
              {`Due ${plannedDialogItem.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Add this as a transaction, or skip this occurrence?`}
            </>
          }
          confirmLabel="Add transaction"
          cancelLabel="Skip"
          confirmVariant="primary"
          cancelVariant="ghost"
          onConfirm={handlePlannedAdd}
          onCancel={handlePlannedSkip}
          onDismiss={() => setPlannedDialogItem(undefined)}
          loading={plannedActionLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </AppShell>
  );
}
