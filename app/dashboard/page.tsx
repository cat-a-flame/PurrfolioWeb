'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCountUp } from '@/lib/useCountUp';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
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
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      supabase.from('recurring_payments').select('*, wallet:wallets(*), category:categories(*)').eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id).gte('due_date', period.from).lte('due_date', period.to),
    ]);
    setPeriodTransactions(txs);
    setPrevTransactions(prevTxs);
    setWalletBalanceSums(walletSums);
    if (walletRes.data) setWallets(walletRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (rpRes.data) setRecurringPayments(rpRes.data as RecurringPayment[]);
    if (occRes.data) setRecurringOccurrences(occRes.data as RecurringOccurrence[]);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
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
    .slice()
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
    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
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
          <Button variant="primary" onClick={openAddDialog}>+ Add transaction</Button>
        </div>

        {walletSummaries.length > 0 && (
          <div className={styles.accountsStrip}>
            {walletSummaries.map(({ wallet, balance: wb }) => (
              <div key={wallet.id} className={styles.accountTile}>
                <div className={styles.accountIcon} style={{ backgroundColor: wallet.color + '22' }}>{wallet.icon}</div>
                <div className={styles.accountInfo}>
                  <span className={styles.accountName}>{wallet.name}</span>
                  <span className={styles.accountBalance}>{formatCurrency(wb, wallet.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.periodRow}>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        <div className={styles.topRow}>
          {/* Cash Flow card */}
          <div className={styles.cashFlowCard} ref={cashFlowRef}>
            <p className={styles.cashFlowTitle}>Cash Flow</p>
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
          </div>

          {/* Planned payments card */}
          <div className={styles.sideCard} style={sideCardHeight ? { height: sideCardHeight } : undefined}>
            <div className={styles.sideCardHeader}>
              <h2 className={styles.sideCardTitle}>Planned payments</h2>
              <Link href="/recurring" className={styles.sideCardLink}>All</Link>
            </div>
            {plannedDue.length === 0 ? (
              <p className={styles.sideCardEmpty}>Nothing due this period.</p>
            ) : (
              <div className={styles.sideCardList}>
                {plannedDue.map(({ payment, dueDate }, i) => (
                  <div key={`${payment.id}-${i}`} className={styles.plannedRow}>
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
            {topCategories.length === 0 ? (
              <p className={styles.sideCardEmpty}>No expenses in this period.</p>
            ) : (
              <div className={styles.sideCardList}>
                {topCategories.map(({ category, total }) => (
                  <div key={category?.id ?? 'uncategorised'} className={styles.catRow}>
                    <div className={styles.catIcon} style={{ backgroundColor: (category?.color ?? '#94a3b8') + '22' }}>
                      {category?.icon ?? '?'}
                    </div>
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
            <Link href="/transactions" className={styles.recentSeeAll}>See all ›</Link>
          </div>
          {loading ? (
            <p className={styles.emptyState}>Loading…</p>
          ) : recentTransactions.length === 0 ? (
            <p className={styles.emptyState}>No transactions in this period.</p>
          ) : (
            <div className={styles.recentList}>
              {recentTransactions.map(t => {
                const isTransfer = !!t.transfer_group_id;
                return (
                  <div key={t.id} className={styles.txRow} onClick={() => openEdit(t)}>
                    <div
                      className={styles.txIcon}
                      style={{ backgroundColor: isTransfer ? 'var(--color-accent-light)' : (t.category?.color ?? '#94a3b8') + '22' }}
                    >
                      {isTransfer ? (t.payer ? (t.type === 'expense' ? '↑' : '↓') : '↔') : (t.category?.icon ?? '?')}
                    </div>
                    <div className={styles.txMain}>
                      <span className={styles.txName}>
                        {isTransfer ? (t.payer ? t.payer : 'Transfer') : (t.category?.name ?? 'Uncategorised')}
                      </span>
                      {t.wallet && <span className={styles.txMeta}>{t.wallet.name}</span>}
                    </div>
                    <div className={styles.txRight}>
                      <span className={[
                        styles.txAmount,
                        isTransfer ? styles.txTransfer : t.type === 'income' ? styles.amtIncome : styles.amtExpense,
                      ].join(' ')}>
                        {isTransfer
                          ? (t.type === 'expense' ? '−' : '')
                          : (t.type === 'income' ? '' : '−')
                        }{formatCurrency(t.amount, t.wallet?.currency ?? 'HUF')}
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

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </AppShell>
  );
}
