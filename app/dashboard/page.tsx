'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AnimatedValue from '@/components/ui/AnimatedValue';
import Link from 'next/link';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { fetchAllTransactions } from '@/lib/supabase/fetchAllTransactions';
import { formatHUF, formatCurrency } from '@/lib/utils';
import { getExchangeRates, toHUF } from '@/lib/exchangeRates';
import type { Transaction, Wallet, Category, Label } from '@/lib/types';
import styles from './page.module.css';

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

function filterByRange(txs: Transaction[], from: string, to: string) {
  return txs.filter(t => t.date >= from && t.date <= to);
}

function formatDayHeader(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function DashboardPage() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [editingTransferPair, setEditingTransferPair] = useState<Transaction | undefined>();
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const [highlightedTxId, setHighlightedTxId] = useState<string | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const prevTxIdsRef = useRef<Set<string> | null>(null);

  // Exchange rates: date → { EUR: number, USD: number, … } (HUF per 1 unit)
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    const dates = [...new Set(
      allTransactions
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
  }, [allTransactions]);

  // Detect newly added transactions and trigger slide-in animation
  useEffect(() => {
    if (loading) return;
    if (prevTxIdsRef.current === null) {
      prevTxIdsRef.current = new Set(allTransactions.map(t => t.id));
      return;
    }
    const newTxs = allTransactions.filter(t => !prevTxIdsRef.current!.has(t.id));
    if (newTxs.length > 0) {
      const newest = [...newTxs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      setHighlightedTxId(newest.id);
      setTimeout(() => setHighlightedTxId(null), 700);
    }
    prevTxIdsRef.current = new Set(allTransactions.map(t => t.id));
  }, [allTransactions, loading]);

  // Lazy load
  const [displayCount, setDisplayCount] = useState(15);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setDisplayCount(15); }, [period]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [transactions, walletRes, catRes, lblRes] = await Promise.all([
      fetchAllTransactions(user.id),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);
    setAllTransactions(transactions);
    if (walletRes.data) setWallets(walletRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    window.addEventListener('transaction-added', fetchData);
    return () => window.removeEventListener('transaction-added', fetchData);
  }, [fetchData]);

  const prevRange = useMemo(() => getPrevRange(period), [period]);
  const periodTxs = useMemo(() => filterByRange(allTransactions, period.from, period.to), [allTransactions, period]);
  const prevTxs   = useMemo(() => filterByRange(allTransactions, prevRange.from, prevRange.to), [allTransactions, prevRange]);

  const income  = periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {}), 0);
  const expense = periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {}), 0);
  const balance = income - expense;

  const prevBalance = prevTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {}), 0)
                    - prevTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {})  , 0);

  const vsPct = prevBalance === 0 ? null : Math.round(((balance - prevBalance) / Math.abs(prevBalance)) * 100);

  const total      = income + expense;
  const incomePct  = total > 0 ? (income  / total) * 100 : 0;
  const expensePct = total > 0 ? (expense / total) * 100 : 0;

  // Wallet totals computed from ALL transactions (not period-filtered)
  const walletSummaries = wallets
    .slice()
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(wallet => {
      const wTxs = allTransactions.filter(t => t.wallet_id === wallet.id);
      const wi = wTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const we = wTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { wallet, balance: wallet.starting_balance + wi - we };
    });

  const hasMore = periodTxs.length > displayCount;
  const visiblePeriodTxs = periodTxs.slice(0, displayCount);

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
    for (const t of visiblePeriodTxs) {
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
  }, [visiblePeriodTxs, ratesByDate]);

  async function handleDelete() {
    if (!editingTransaction) return;
    // Trigger exit animation before the network call
    if (editingTransaction.transfer_group_id) {
      setDeletingGroupId(editingTransaction.transfer_group_id);
    } else {
      setDeletingTxId(editingTransaction.id);
    }
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
    setDeletingTxId(null);
    setDeletingGroupId(null);
  }

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (!editingTransaction) return;

    if (data.transfer) {
      // Delete original record(s) — both legs if it was already a transfer
      if (editingTransaction.transfer_group_id) {
        await supabase.from('transactions').delete().eq('transfer_group_id', editingTransaction.transfer_group_id);
      } else {
        await supabase.from('transactions').delete().eq('id', editingTransaction.id);
      }
      const transferGroupId = crypto.randomUUID();
      const common = { user_id: user.id, date: data.date, notes: data.notes || null, transfer_group_id: transferGroupId };
      const { error } = await supabase.from('transactions').insert([
        { ...common, type: 'expense', amount: data.amount, wallet_id: data.wallet_id },
        { ...common, type: 'income', amount: data.transfer.to_amount, wallet_id: data.transfer.to_wallet_id },
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
      const allLegs = allTransactions.filter(tx => tx.transfer_group_id === t.transfer_group_id);
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
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>

          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Dashboard</h1>
          </div>

          <div className={styles.twoCol}>
            {/* Left column: Wallets (hidden on mobile) */}
            <div className={styles.leftCol}>
              {walletSummaries.length > 0 && (
                <div className={styles.walletList}>
                  {walletSummaries.map(({ wallet, balance: wb }) => (
                    <div key={wallet.id} className={styles.walletCard} style={{ borderLeftColor: wallet.color }}>
                      <div className={styles.walletCardHeader}>
                        <span className={styles.walletCardIcon}>{wallet.icon}</span>
                        <span className={styles.walletCardName}>{wallet.name}</span>
                        <span className={styles.walletCardCurrency}>{wallet.currency}</span>
                      </div>
                      <div className={styles.walletCardBalance}>{formatCurrency(wb, wallet.currency)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right column: Cash Flow + Transactions */}
            <div className={styles.rightCol}>

              {/* Cash Flow card */}
              <div className={styles.cashFlowCard}>
                <p className={styles.cashFlowTitle}>Cash Flow</p>
                <div className={styles.cashFlowTop}>
                  <div className={styles.cashFlowLeft}>
                    <span className={styles.cashFlowPeriodLabel}>{period.label}</span>
                    <div className={styles.cashFlowBalance}><AnimatedValue value={balance} format={formatHUF} /></div>
                  </div>
                  {vsPct !== null && (
                    <div className={styles.cashFlowRight}>
                      <span className={styles.vsLabel}>VS Previous Period</span>
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

              {/* Period picker — below Cash Flow */}
              <div className={styles.periodRow}>
                <PeriodPicker value={period} onChange={setPeriod} />
              </div>

              {/* Transactions grouped by day */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Transactions</h2>
                  <Link href="/transactions" className={styles.viewAll}>View all →</Link>
                </div>
                {loading ? (
                  <p className={styles.emptyState}>Loading…</p>
                ) : groupedDays.length === 0 ? (
                  <p className={styles.emptyState}>No transactions in this period.</p>
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
                            const isHighlighted = t.id === highlightedTxId;
                            const isDeleting = t.id === deletingTxId || (!!t.transfer_group_id && t.transfer_group_id === deletingGroupId);
                            return (
                              <div key={t.id} className={[styles.txRow, isHighlighted && styles.txRowNew, isDeleting && styles.txRowDeleting].filter(Boolean).join(' ')}>
                                <div
                                  className={styles.txIcon}
                                  style={{ backgroundColor: isTransfer ? 'var(--color-accent-light)' : (t.category?.color ?? '#94a3b8') + '22' }}
                                >
                                  {isTransfer ? '↔' : (t.category?.icon ?? '?')}
                                </div>
                                <div className={styles.txMain}>
                                  <span className={styles.txCategory}>
                                    {isTransfer ? 'Transfer' : (t.category?.name ?? 'Uncategorised')}
                                  </span>
                                  {t.wallet && (
                                    <span className={styles.txWallet}>
                                      <span className={styles.txWalletDot} style={{ backgroundColor: t.wallet.color }} />
                                      {t.wallet.name}
                                    </span>
                                  )}
                                  {t.labels && t.labels.length > 0 && (
                                    <span className={styles.txLabels}>
                                      {t.labels.map(l => (
                                        <span key={l.id} className={styles.txLabel} style={{ backgroundColor: l.color + '22', color: l.color }}>
                                          {l.name}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                                <div className={styles.txRight}>
                                  <span className={[
                                    styles.txAmount,
                                    isTransfer ? styles.txTransfer : t.type === 'income' ? styles.txIncome : styles.txExpense,
                                  ].join(' ')}>
                                    {isTransfer
                                      ? (t.type === 'expense' ? '−' : '')
                                      : (t.type === 'income' ? '' : '−')
                                    }{formatCurrency(t.amount, t.wallet?.currency ?? 'HUF')}
                                  </span>
                                  <button
                                    className={styles.txEditBtn}
                                    onClick={() => openEdit(t)}
                                    aria-label="Edit transaction"
                                  >
                                    Edit
                                  </button>
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
              </section>

            </div>
          </div>

        </div>
      </main>
      <AppFooter />

      {editingTransaction && (
        <TransactionForm
          wallets={wallets}
          categories={categories}
          labels={labels}
          templates={[]}
          transaction={editingTransaction}
          transferPair={editingTransferPair}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setEditingTransaction(undefined); setEditingTransferPair(undefined); }}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
