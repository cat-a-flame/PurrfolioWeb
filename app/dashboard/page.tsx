'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import TransactionForm, { TransactionFormData } from '@/components/transactions/TransactionForm';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { formatHUF, formatCurrency } from '@/lib/utils';
import type { Transaction, Wallet, Category, Label } from '@/lib/types';
import styles from './page.module.css';

type RawTransactionLabel = {
  label: { id: string; user_id: string; name: string; color: string; created_at: string } | null;
};
type RawTransaction = Omit<Transaction, 'labels'> & {
  wallet: Wallet | null;
  category: Transaction['category'];
  labels: RawTransactionLabel[];
};

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [txRes, walletRes, catRes, lblRes] = await Promise.all([
      supabase
        .from('transactions')
        .select(`*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))`)
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);
    if (txRes.data) {
      setAllTransactions((txRes.data as RawTransaction[]).map(t => ({
        ...t,
        labels: t.labels.map(l => l.label).filter((l): l is NonNullable<typeof l> => l !== null),
      })));
    }
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

  const income  = periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);
  const expense = periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const prevBalance = prevTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0)
                    - prevTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);

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
        net: txs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0)
           - txs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0),
      }));
  }, [periodTxs]);

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (!editingTransaction) return;

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

    setEditingTransaction(undefined);
    setToast({ message: 'Transaction updated.', variant: 'success' });
    window.dispatchEvent(new Event('transaction-added'));
    await fetchData();
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>

          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Dashboard</h1>
          </div>

          {/* Wallet totals — not affected by date filter */}
          {walletSummaries.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Wallets</h2>
              <div className={styles.walletGrid}>
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
            </section>
          )}

          {/* Cash Flow card */}
          <div className={styles.cashFlowCard}>
            <p className={styles.cashFlowTitle}>Cash Flow</p>
            <div className={styles.cashFlowTop}>
              <div className={styles.cashFlowLeft}>
                <span className={styles.cashFlowPeriodLabel}>{period.label}</span>
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
                                {isTransfer ? (t.type === 'expense' ? 'Transfer out' : 'Transfer in') : (t.category?.name ?? 'Uncategorised')}
                              </span>
                              {t.wallet && (
                                <span className={styles.txWallet}>
                                  <span className={styles.txWalletDot} style={{ backgroundColor: t.wallet.color }} />
                                  {t.wallet.name}
                                </span>
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
                              <span className={styles.txTime}>{formatTime(t.created_at)}</span>
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
          </section>

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
          onSave={handleSave}
          onClose={() => setEditingTransaction(undefined)}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
