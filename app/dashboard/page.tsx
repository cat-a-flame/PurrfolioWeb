'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import TransactionItem from '@/components/transactions/TransactionItem';
import { createClient } from '@/lib/supabase/client';
import { formatHUF, formatCurrency } from '@/lib/utils';
import type { Transaction, Wallet } from '@/lib/types';
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

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
      const normalized: Transaction[] = (txRes.data as RawTransaction[]).map((t) => ({
        ...t,
        labels: t.labels
          .map((l) => l.label)
          .filter((l): l is NonNullable<typeof l> => l !== null),
      }));
      setTransactions(normalized);
    }
    if (walletRes.data) setWallets(walletRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
    window.addEventListener('transaction-added', fetchTransactions);
    return () => window.removeEventListener('transaction-added', fetchTransactions);
  }, [fetchTransactions]);

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;

  const recent = transactions.slice(0, 8);

  const walletSummaries = wallets.map((wallet) => {
    const wTxs = transactions.filter((t) => t.wallet_id === wallet.id);
    const income = wTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = wTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { wallet, income, expenses, balance: income - expenses };
  });

  function handleEdit() {
    // No-op on dashboard — navigation to /transactions for editing
  }

  function handleDelete() {
    // No-op on dashboard
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Dashboard</h1>

          {/* Summary cards */}
          <div className={styles.summaryGrid}>
            <div className={[styles.card, styles.cardBalance].join(' ')}>
              <span className={styles.cardLabel}>Balance</span>
              <span className={styles.cardValue}>{formatHUF(balance)}</span>
            </div>
            <div className={[styles.card, styles.cardIncome].join(' ')}>
              <span className={styles.cardLabel}>Income</span>
              <span className={styles.cardValue}>{formatHUF(totalIncome)}</span>
            </div>
            <div className={[styles.card, styles.cardExpenses].join(' ')}>
              <span className={styles.cardLabel}>Expenses</span>
              <span className={styles.cardValue}>{formatHUF(totalExpenses)}</span>
            </div>
          </div>

          {/* Wallet breakdown */}
          {walletSummaries.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>By wallet</h2>
              </div>
              <div className={styles.walletGrid}>
                {walletSummaries.map(({ wallet, income, expenses, balance: wBalance }) => (
                  <div key={wallet.id} className={styles.walletCard} style={{ borderLeftColor: wallet.color }}>
                    <div className={styles.walletCardHeader}>
                      <span className={styles.walletCardIcon}>{wallet.icon}</span>
                      <span className={styles.walletCardName}>{wallet.name}</span>
                      <span className={styles.walletCardCurrency}>{wallet.currency}</span>
                    </div>
                    <div className={styles.walletCardBalance}>
                      {formatCurrency(wBalance, wallet.currency)}
                    </div>
                    <div className={styles.walletCardDetails}>
                      <span className={styles.walletCardIncome}>+{formatCurrency(income, wallet.currency)}</span>
                      <span className={styles.walletCardExpenses}>−{formatCurrency(expenses, wallet.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent transactions */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recent transactions</h2>
              <Link href="/transactions" className={styles.viewAll}>
                View all →
              </Link>
            </div>

            {loading ? (
              <p className={styles.emptyState}>Loading…</p>
            ) : recent.length === 0 ? (
              <p className={styles.emptyState}>
                No transactions yet.{' '}
                <Link href="/transactions" className={styles.link}>
                  Add your first one
                </Link>
                .
              </p>
            ) : (
              <div className={styles.list}>
                {recent.map((t) => (
                  <TransactionItem
                    key={t.id}
                    transaction={t}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
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
