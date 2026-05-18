'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import { createClient } from '@/lib/supabase/client';
import { formatHUF, formatCurrency } from '@/lib/utils';
import type { Transaction, Wallet } from '@/lib/types';
import styles from './page.module.css';

type Period = 'week' | 'month' | 'year' | 'custom';

type RawTransactionLabel = {
  label: { id: string; user_id: string; name: string; color: string; created_at: string } | null;
};
type RawTransaction = Omit<Transaction, 'labels'> & {
  wallet: Wallet | null;
  category: Transaction['category'];
  labels: RawTransactionLabel[];
};

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function getPeriodRange(period: Period, cf: string, ct: string): { from: string; to: string } {
  const now = new Date();
  if (period === 'week') {
    const dow = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: isoDate(mon), to: isoDate(sun) };
  }
  if (period === 'month') {
    return {
      from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (period === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  return { from: cf || isoDate(now), to: ct || isoDate(now) };
}

function getPrevRange(period: Period, from: string, to: string): { from: string; to: string } {
  if (period === 'week') {
    return {
      from: isoDate(new Date(new Date(from).getTime() - 7 * 86400000)),
      to: isoDate(new Date(new Date(to).getTime() - 7 * 86400000)),
    };
  }
  if (period === 'month') {
    const f = new Date(from + 'T12:00:00');
    return {
      from: isoDate(new Date(f.getFullYear(), f.getMonth() - 1, 1)),
      to: isoDate(new Date(f.getFullYear(), f.getMonth(), 0)),
    };
  }
  if (period === 'year') {
    const y = parseInt(from.slice(0, 4));
    return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
  const f = new Date(from + 'T12:00:00'), t = new Date(to + 'T12:00:00');
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  return {
    from: isoDate(new Date(f.getTime() - days * 86400000)),
    to: isoDate(new Date(f.getTime() - 86400000)),
  };
}

function filterByRange(txs: Transaction[], from: string, to: string) {
  return txs.filter(t => t.date >= from && t.date <= to);
}

function getPeriodLabel(period: Period, from: string): string {
  if (period === 'week') return 'This week';
  if (period === 'year') return from.slice(0, 4);
  if (period === 'month') {
    return new Date(from + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return 'Custom range';
}

function formatDayHeader(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function DashboardPage() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [txRes, walletRes] = await Promise.all([
      supabase
        .from('transactions')
        .select(`*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))`)
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
    ]);

    if (txRes.data) {
      const normalized: Transaction[] = (txRes.data as RawTransaction[]).map(t => ({
        ...t,
        labels: t.labels.map(l => l.label).filter((l): l is NonNullable<typeof l> => l !== null),
      }));
      setAllTransactions(normalized);
    }
    if (walletRes.data) setWallets(walletRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    window.addEventListener('transaction-added', fetchData);
    return () => window.removeEventListener('transaction-added', fetchData);
  }, [fetchData]);

  const { from, to } = useMemo(
    () => getPeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const prevRange = useMemo(() => getPrevRange(period, from, to), [period, from, to]);

  const periodTxs = useMemo(() => filterByRange(allTransactions, from, to), [allTransactions, from, to]);
  const prevTxs = useMemo(
    () => filterByRange(allTransactions, prevRange.from, prevRange.to),
    [allTransactions, prevRange]
  );

  const income = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const prevIncome = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const prevBalance = prevIncome - prevExpense;

  const vsPct = prevBalance === 0 ? null
    : Math.round(((balance - prevBalance) / Math.abs(prevBalance)) * 100);

  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 0;
  const expensePct = total > 0 ? (expense / total) * 100 : 0;

  const walletSummaries = wallets.map(wallet => {
    const wTxs = periodTxs.filter(t => t.wallet_id === wallet.id);
    const wi = wTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const we = wTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { wallet, income: wi, expense: we, balance: wi - we };
  });

  const groupedDays = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of periodTxs) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, txs]) => ({
        date,
        transactions: [...txs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        net: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
           - txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      }));
  }, [periodTxs]);

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>

          {/* Title + period picker */}
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Dashboard</h1>
            <div className={styles.periodPicker}>
              {(['week', 'month', 'year', 'custom'] as Period[]).map(p => (
                <button
                  key={p}
                  className={[styles.periodBtn, period === p ? styles.periodBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setPeriod(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div className={styles.customRange}>
              <input type="date" className={styles.dateInput} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span className={styles.dateSep}>–</span>
              <input type="date" className={styles.dateInput} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}

          {/* Cash Flow card */}
          <div className={styles.cashFlowCard}>
            <p className={styles.cashFlowTitle}>Cash Flow</p>
            <div className={styles.cashFlowTop}>
              <div className={styles.cashFlowLeft}>
                <span className={styles.cashFlowPeriodLabel}>{getPeriodLabel(period, from)}</span>
                <div className={styles.cashFlowBalance}>{formatHUF(balance)}</div>
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

          {/* By wallet */}
          {walletSummaries.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>By wallet</h2>
              <div className={styles.walletGrid}>
                {walletSummaries.map(({ wallet, income: wi, expense: we, balance: wb }) => (
                  <div key={wallet.id} className={styles.walletCard} style={{ borderLeftColor: wallet.color }}>
                    <div className={styles.walletCardHeader}>
                      <span className={styles.walletCardIcon}>{wallet.icon}</span>
                      <span className={styles.walletCardName}>{wallet.name}</span>
                      <span className={styles.walletCardCurrency}>{wallet.currency}</span>
                    </div>
                    <div className={styles.walletCardBalance}>{formatCurrency(wb, wallet.currency)}</div>
                    <div className={styles.walletCardDetails}>
                      <span className={styles.walletCardIncome}>+{formatCurrency(wi, wallet.currency)}</span>
                      <span className={styles.walletCardExpense}>−{formatCurrency(we, wallet.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

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
                      {dayTxs.map(t => (
                        <div key={t.id} className={styles.txRow}>
                          <div
                            className={styles.txIcon}
                            style={{ backgroundColor: (t.category?.color ?? '#94a3b8') + '22' }}
                          >
                            {t.category?.icon ?? '?'}
                          </div>
                          <div className={styles.txMain}>
                            <span className={styles.txCategory}>{t.category?.name ?? 'Uncategorised'}</span>
                            {t.wallet && (
                              <span className={styles.txWallet}>
                                <span className={styles.txWalletDot} style={{ backgroundColor: t.wallet.color }} />
                                {t.wallet.name}
                              </span>
                            )}
                          </div>
                          <div className={styles.txRight}>
                            <span className={[styles.txAmount, t.type === 'income' ? styles.txIncome : styles.txExpense].join(' ')}>
                              {t.type === 'income' ? '' : '−'}{formatCurrency(t.amount, t.wallet?.currency ?? 'HUF')}
                            </span>
                            <span className={styles.txTime}>{formatTime(t.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </main>
      <AppFooter />
    </div>
  );
}
