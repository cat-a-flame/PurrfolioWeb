'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCountUp } from '@/lib/useCountUp';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
  type PieLabelRenderProps,
} from 'recharts';
import AppShell from '@/components/layout/AppShell';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import { createClient } from '@/lib/supabase/client';
import { fetchTransactions } from '@/lib/supabase/fetchTransactions';
import { fetchWalletBalanceSums } from '@/lib/supabase/fetchWalletBalanceSums';
import { getExchangeRates, toHUF, txToHUF } from '@/lib/exchangeRates';
import { formatCurrency, formatHUF, formatNumber } from '@/lib/utils';
import { generateDueDates, isoDate as recurringIsoDate } from '@/lib/recurringUtils';
import type { Transaction, Wallet, Currency, RecurringPayment, RecurringOccurrence } from '@/lib/types';
import styles from './page.module.css';

// ─── palette ────────────────────────────────────────────────────────────────
const PALETTE = [
  '#f26e4d','#f59e0b','#10b981','#6366f1','#ec4899',
  '#14b8a6','#8b5cf6','#f97316','#06b6d4','#84cc16',
  '#a78bfa','#fb7185','#0ea5e9','#d946ef','#22c55e',
];

function renderExpenseLabel({ cx, cy, midAngle, outerRadius, percent }: PieLabelRenderProps) {
  if (!percent || cx == null || cy == null || midAngle == null || outerRadius == null) return null;
  const pct = Math.round((percent as number) * 100);
  if (pct === 0) return null;
  const r = (outerRadius as number) + 22;
  const x = (cx as number) + r * Math.cos(-((midAngle as number) * Math.PI) / 180);
  const y = (cy as number) + r * Math.sin(-((midAngle as number) * Math.PI) / 180);
  return (
    <g>
      <rect x={x - 18} y={y - 10} width={36} height={20} rx={10} fill="rgba(0,0,0,0.55)" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11} fontWeight={700}>
        {pct}%
      </text>
    </g>
  );
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultPeriod(): PeriodValue {
  const now = new Date();
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to:   isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    label: 'This month',
    tab: 'months',
  };
}

function getPrevRange(v: PeriodValue): { from: string; to: string } {
  const f = new Date(v.from + 'T12:00:00');
  const t = new Date(v.to   + 'T12:00:00');
  if (v.tab === 'weeks')  return { from: isoDate(new Date(f.getTime() - 7*86400000)), to: isoDate(new Date(t.getTime() - 7*86400000)) };
  if (v.tab === 'months') return { from: isoDate(new Date(f.getFullYear(), f.getMonth() - 1, 1)), to: isoDate(new Date(f.getFullYear(), f.getMonth(), 0)) };
  if (v.tab === 'years')  { const y = f.getFullYear() - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  return { from: isoDate(new Date(f.getTime() - days*86400000)), to: isoDate(new Date(f.getTime() - 86400000)) };
}

function filterRange(txs: Transaction[], from: string, to: string) {
  return txs.filter(t => t.date >= from && t.date <= to);
}

function shortMonth(iso: string) {
  return new Date(iso + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── custom tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      {label && <p className={styles.tooltipLabel}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className={styles.tooltipRow} style={{ color: p.color }}>
          {p.name}: {formatHUF(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── stat card icons ────────────────────────────────────────────────────────
function IncomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function ExpenseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

function NetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 7h12m0 0-4-4m4 4-4 4" />
      <path d="M17 15H5m0 0 4 4m-4-4 4-4" />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 6h10.5" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 12h10.5" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 18h10.5" />
    </svg>
  );
}

function progressPct(actual: number, projected: number): number {
  if (projected <= 0) return 0;
  return Math.max(0, Math.min(100, (actual / projected) * 100));
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function StatisticsPage() {
  const [allTxs, setAllTxs]   = useState<Transaction[]>([]);
  const [prevTxsData, setPrevTxsData] = useState<Transaction[]>([]);
  const [walletBalanceSums, setWalletBalanceSums] = useState<Map<string, { income: number; expense: number }>>(new Map());
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod]   = useState<PeriodValue>(defaultPeriod);
  const [todayRates, setTodayRates] = useState<Record<string, number>>({});
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});
  const [recurringPayments, setRecurringPayments]     = useState<RecurringPayment[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<RecurringOccurrence[]>([]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const today = isoDate(new Date());
    getExchangeRates(today).then(setTodayRates);
  }, []);

  useEffect(() => {
    const combined = [...allTxs, ...prevTxsData];
    const dates = [...new Set(
      combined
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
  }, [allTxs, prevTxsData]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const from = new Date(period.from + 'T00:00:00');
    const to   = new Date(period.to   + 'T00:00:00');
    const prev = getPrevRange(period);
    const [transactions, prevTransactions, walletSums, wRes, pmtRes, occRes] = await Promise.all([
      fetchTransactions(user.id, period.from, period.to),
      fetchTransactions(user.id, prev.from, prev.to),
      fetchWalletBalanceSums(user.id),
      supabase.from('wallets').select('*').eq('user_id', user.id),
      supabase.from('recurring_payments').select('*, wallet:wallets(*), category:categories(*)').eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id)
        .gte('due_date', recurringIsoDate(from)).lte('due_date', recurringIsoDate(to)),
    ]);
    setAllTxs(transactions);
    setPrevTxsData(prevTransactions);
    setWalletBalanceSums(walletSums);
    if (wRes.data) setWallets(wRes.data);
    if (pmtRes.data) setRecurringPayments(pmtRes.data as RecurringPayment[]);
    if (occRes.data) setRecurringOccurrences(occRes.data);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
    window.addEventListener('transaction-added', fetchData);

    const supabase = createClient();
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return;
      channel = supabase
        .channel('stats-recurring-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_occurrences', filter: `user_id=eq.${user.id}` }, () => fetchData())
        .subscribe();
    });

    return () => {
      mounted = false;
      window.removeEventListener('transaction-added', fetchData);
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const periodTxs = allTxs;
  const prevTxs   = prevTxsData;

  // ── summary numbers ────────────────────────────────────────────────────
  const income  = useMemo(() => periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0), [periodTxs, ratesByDate]);
  const expense = useMemo(() => periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0), [periodTxs, ratesByDate]);

  const txCount = periodTxs.filter(t => !t.transfer_group_id).length;
  const incomeCount  = periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).length;
  const expenseCount = periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).length;
  const animatedIncome  = useCountUp(income);
  const animatedExpense = useCountUp(expense);
  const animatedNet     = useCountUp(income - expense);
  const animatedTxCount = useCountUp(txCount);

  // ── Cash flow projection (selected period) ──────────────────────────────
  const cashFlowProjection = useMemo(() => {
    const from = new Date(period.from + 'T00:00:00');
    const to   = new Date(period.to   + 'T00:00:00');

    // Pending planned payments due within the selected period — convert to HUF using today's rates
    const actionedKeys = new Set(recurringOccurrences.map(o => `${o.recurring_payment_id}|${o.due_date.slice(0, 10)}`));
    let plannedIncome  = 0;
    let plannedExpense = 0;
    for (const p of recurringPayments) {
      for (const date of generateDueDates(p, from, to)) {
        const key = `${p.id}|${recurringIsoDate(date)}`;
        if (actionedKeys.has(key)) continue;
        const hufAmount = toHUF(p.amount, p.wallet?.currency, todayRates);
        if (p.type === 'income')  plannedIncome  += hufAmount;
        if (p.type === 'expense') plannedExpense += hufAmount;
      }
    }

    // Actual for the period — periodTxs is already scoped to period.from/period.to
    return { actualIncome: income, actualExpense: expense, plannedIncome, plannedExpense };
  }, [period, income, expense, recurringPayments, recurringOccurrences, todayRates]);

  // ── 1. Balance by currency ──────────────────────────────────────────────
  const currencyBalances = useMemo(() => {
    const map = new Map<Currency, number>();
    for (const w of wallets) {
      const sums = walletBalanceSums.get(w.id) ?? { income: 0, expense: 0 };
      const bal = w.starting_balance + sums.income - sums.expense;
      map.set(w.currency, (map.get(w.currency) ?? 0) + bal);
    }
    return Array.from(map.entries()).map(([currency, balance], i) => ({
      currency,
      balance,
      balanceHUF: toHUF(balance, currency, todayRates),
      fill: PALETTE[i % PALETTE.length],
    }));
  }, [walletBalanceSums, wallets, todayRates]);

  // ── 2. Expenses structure (doughnut) ──────────────────────────────────
  const [otherExpanded, setOtherExpanded] = useState(false);

  const { expenseSlices, otherItems } = useMemo(() => {
    const map = new Map<string, { amount: number; color: string }>();
    for (const t of periodTxs) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name  = t.category?.name  ?? 'Uncategorised';
      const color = t.category?.color ?? '#94a3b8';
      const prev  = map.get(name) ?? { amount: 0, color };
      map.set(name, { amount: prev.amount + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), color });
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.amount, 0);
    const sorted = Array.from(map.entries()).sort((a, b) => b[1].amount - a[1].amount);
    const slices = sorted
      .filter(([, { amount }]) => amount >= 10_000)
      .map(([name, { amount, color }], i) => ({
        name,
        amount,
        color: color !== '#94a3b8' ? color : PALETTE[i % PALETTE.length],
        pct: total > 0 ? Math.round((amount / total) * 100) : 0,
      }));
    const smallEntries = sorted.filter(([, { amount }]) => amount < 10_000);
    const otherAmount = smallEntries.reduce((s, [, { amount }]) => s + amount, 0);
    const otherItems = smallEntries.map(([name, { amount, color }]) => ({
      name,
      amount,
      color,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
    }));
    if (otherAmount > 0) {
      slices.push({
        name: 'Other',
        amount: otherAmount,
        color: '#94a3b8',
        pct: total > 0 ? Math.round((otherAmount / total) * 100) : 0,
      });
    }
    return { expenseSlices: slices, otherItems };
  }, [periodTxs, ratesByDate]);

  // ── 3. Period comparison ──────────────────────────────────────────────
  const comparisonData = useMemo(() => {
    const catMap = new Map<string, { current: number; prev: number; color: string }>();
    for (const t of [...periodTxs, ...prevTxs]) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name  = t.category?.name  ?? 'Uncategorised';
      const color = t.category?.color ?? '#94a3b8';
      if (!catMap.has(name)) catMap.set(name, { current: 0, prev: 0, color });
    }
    for (const t of periodTxs) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name = t.category?.name ?? 'Uncategorised';
      catMap.get(name)!.current += txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
    }
    for (const t of prevTxs) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name = t.category?.name ?? 'Uncategorised';
      catMap.get(name)!.prev += txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
    }
    return Array.from(catMap.entries())
      .sort((a, b) => (b[1].current + b[1].prev) - (a[1].current + a[1].prev))
      .slice(0, 10)
      .map(([name, v]) => ({ name, current: Math.round(v.current), prev: Math.round(v.prev) }))
      .reverse(); // bottom-up for horizontal bar
  }, [periodTxs, prevTxs, ratesByDate]);

  // ── 4. Spending trend ─────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const fromDate = new Date(period.from + 'T12:00:00');
    const toDate   = new Date(period.to   + 'T12:00:00');
    const days     = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    const byMonth  = days > 62;

    if (byMonth) {
      const map = new Map<string, { income: number; expense: number }>();
      let cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
      while (cur <= toDate) {
        map.set(isoDate(cur).slice(0, 7), { income: 0, expense: 0 });
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
      for (const t of periodTxs) {
        if (t.transfer_group_id) continue;
        const key = t.date.slice(0, 7);
        const v   = map.get(key);
        if (!v) continue;
        if (t.type === 'income')  v.income  += txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
        if (t.type === 'expense') v.expense += txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
      }
      return Array.from(map.entries()).map(([k, v]) => ({ label: shortMonth(k), income: Math.round(v.income), expense: Math.round(v.expense) }));
    } else {
      const map = new Map<string, { income: number; expense: number }>();
      for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
        map.set(isoDate(new Date(d)), { income: 0, expense: 0 });
      }
      for (const t of periodTxs) {
        if (t.transfer_group_id) continue;
        const v = map.get(t.date);
        if (!v) continue;
        if (t.type === 'income')  v.income  += txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
        if (t.type === 'expense') v.expense += txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
      }
      return Array.from(map.entries()).map(([k, v]) => ({
        label: new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        income: Math.round(v.income), expense: Math.round(v.expense),
      }));
    }
  }, [periodTxs, period, ratesByDate]);

  // ── 5. Top categories by spend ────────────────────────────────────────
  const topCategories = useMemo(() => expenseSlices.slice(0, 5), [expenseSlices]);

  if (loading) return (
    <AppShell><p className={styles.loading}>Loading…</p></AppShell>
  );

  const prevLabel = period.tab === 'months' ? 'prev month' : period.tab === 'years' ? 'prev year' : period.tab === 'weeks' ? 'prev week' : 'prev period';

  return (
    <AppShell>
        <div className={styles.container}>

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Statistics</h1>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>

          {/* ── Summary row (with optional projected line) ── */}
          {(() => {
            const projIncome  = cashFlowProjection.actualIncome  + cashFlowProjection.plannedIncome;
            const projExpense = cashFlowProjection.actualExpense + cashFlowProjection.plannedExpense;
            const projNet     = projIncome - projExpense;
            const hasPlanned  = recurringPayments.length > 0 && (cashFlowProjection.plannedIncome > 0 || cashFlowProjection.plannedExpense > 0);
            const showIncomeProjection = hasPlanned && cashFlowProjection.plannedIncome > 0;
            return (
              <div className={styles.summaryRow}>
                <div className={styles.statCard}>
                  <div className={styles.statHead}>
                    <div className={[styles.statIcon, styles.statIconIncome].join(' ')}><IncomeIcon /></div>
                    <span className={styles.statLabel}>Income</span>
                  </div>
                  <div className={[styles.statAmount, styles.statAmountIncome].join(' ')}>{formatHUF(animatedIncome)}</div>
                  <div className={styles.statDivider} />
                  {showIncomeProjection ? (
                    <div className={styles.statFooter}>
                      <div className={styles.statFooterRow}>
                        <span className={styles.statFooterLabel}>
                          <span className={[styles.statDot, styles.statDotIncome].join(' ')} />Projected
                        </span>
                        <span className={[styles.statFooterValue, styles.statFooterValueIncome].join(' ')}>{formatHUF(projIncome)}</span>
                      </div>
                      <div className={styles.statBarTrack}>
                        <div className={[styles.statBarFill, styles.statBarFillIncome].join(' ')} style={{ width: `${progressPct(income, projIncome)}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className={styles.statFooterEmpty}>No pending income</p>
                  )}
                </div>

                <div className={styles.statCard}>
                  <div className={styles.statHead}>
                    <div className={[styles.statIcon, styles.statIconExpense].join(' ')}><ExpenseIcon /></div>
                    <span className={styles.statLabel}>Expenses</span>
                  </div>
                  <div className={[styles.statAmount, styles.statAmountExpense].join(' ')}>{formatHUF(animatedExpense)}</div>
                  <div className={styles.statDivider} />
                  {hasPlanned ? (
                    <div className={styles.statFooter}>
                      <div className={styles.statFooterRow}>
                        <span className={styles.statFooterLabel}>
                          <span className={[styles.statDot, styles.statDotExpense].join(' ')} />Projected
                        </span>
                        <span className={[styles.statFooterValue, styles.statFooterValueExpense].join(' ')}>{formatHUF(projExpense)}</span>
                      </div>
                      <div className={styles.statBarTrack}>
                        <div className={[styles.statBarFill, styles.statBarFillExpense].join(' ')} style={{ width: `${progressPct(expense, projExpense)}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className={styles.statFooterEmpty}>No pending expenses</p>
                  )}
                </div>

                <div className={styles.statCard}>
                  <div className={styles.statHead}>
                    <div className={[styles.statIcon, styles.statIconNet].join(' ')}><NetIcon /></div>
                    <span className={styles.statLabel}>Net</span>
                  </div>
                  <div className={styles.statAmount}>
                    {income - expense >= 0 ? '+' : ''}{formatHUF(animatedNet)}
                  </div>
                  <div className={styles.statDivider} />
                  {hasPlanned ? (
                    <div className={styles.statFooter}>
                      <div className={styles.statFooterRow}>
                        <span className={styles.statFooterLabel}>
                          <span className={[styles.statDot, styles.statDotNet].join(' ')} />Projected
                        </span>
                        <span className={[styles.statFooterValue, styles.statFooterValueNet].join(' ')}>{projNet >= 0 ? '+' : ''}{formatHUF(projNet)}</span>
                      </div>
                      <div className={styles.statBarTrack}>
                        <div className={[styles.statBarFill, styles.statBarFillNet].join(' ')} style={{ width: `${progressPct(income - expense, projNet)}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className={styles.statFooterEmpty}>No projection</p>
                  )}
                </div>

                <div className={styles.statCard}>
                  <div className={styles.statHead}>
                    <div className={[styles.statIcon, styles.statIconTx].join(' ')}><TransactionsIcon /></div>
                    <span className={styles.statLabel}>Transactions</span>
                  </div>
                  <div className={styles.statAmount}>{animatedTxCount}</div>
                  <div className={styles.statDivider} />
                  <p className={styles.statFooterEmpty}>{expenseCount} expense · {incomeCount} income</p>
                </div>
              </div>
            );
          })()}

          {/* ── Main grid ── */}
          <div className={styles.grid}>

            {/* ── Expenses structure ── */}
            <div className={[styles.card, styles.cardDoughnut].join(' ')}>
              <h2 className={styles.cardTitle}>Expenses by Category</h2>
              <p className={styles.cardSubtitle}>{period.label}</p>
              {expenseSlices.length === 0 ? (
                <p className={styles.empty}>No expenses in this period.</p>
              ) : (
                <div className={styles.doughnutLayout}>
                  {mounted && (
                    <div className={styles.doughnutChart}>
                      <ResponsiveContainer width="100%" height={290}>
                        <PieChart>
                          <Pie
                            data={expenseSlices}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={7}
                            startAngle={90}
                            endAngle={-270}
                            cornerRadius={14}
                            label={renderExpenseLabel}
                            labelLine={false}
                          >
                            {expenseSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
                          </Pie>
                          <Tooltip formatter={(v) => formatHUF(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className={styles.doughnutLegend}>
                    {expenseSlices.map((s, i) => {
                      const isOther = s.name === 'Other' && otherItems.length > 0;
                      return (
                        <div key={i}>
                          <div
                            className={[styles.legendRow, isOther ? styles.legendRowOther : ''].filter(Boolean).join(' ')}
                            onClick={isOther ? () => setOtherExpanded(e => !e) : undefined}
                            role={isOther ? 'button' : undefined}
                            tabIndex={isOther ? 0 : undefined}
                            onKeyDown={isOther ? (e) => { if (e.key === 'Enter' || e.key === ' ') setOtherExpanded(v => !v); } : undefined}
                            aria-expanded={isOther ? otherExpanded : undefined}
                          >
                            <span className={styles.legendDot} style={{ backgroundColor: s.color }} />
                            <span className={styles.legendName}>
                              {s.name}
                              {isOther && (
                                <svg className={[styles.chevron, otherExpanded ? styles.chevronOpen : ''].filter(Boolean).join(' ')} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              )}
                            </span>
                            <span className={styles.legendPct}>{s.pct}%</span>
                            <span className={styles.legendAmount}>{formatHUF(s.amount)}</span>
                          </div>
                          {isOther && otherExpanded && otherItems.map((item, j) => (
                            <div key={j} className={[styles.legendRow, styles.legendSubRow].join(' ')}>
                              <span className={styles.legendDot} style={{ backgroundColor: item.color }} />
                              <span className={styles.legendName}>{item.name}</span>
                              <span className={styles.legendPct}>{item.pct}%</span>
                              <span className={styles.legendAmount}>{formatHUF(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Balance by currencies ── */}
            <div className={[styles.card, styles.cardBalances].join(' ')}>
              <h2 className={styles.cardTitle}>Balance by Currency</h2>
              <p className={styles.cardSubtitle}>Current total across all accounts</p>
              {currencyBalances.length === 0 ? (
                <p className={styles.empty}>No accounts yet.</p>
              ) : (
                <div className={styles.balanceList}>
                  {(() => {
                    const maxHUF = Math.max(...currencyBalances.map(c => Math.abs(c.balanceHUF)));
                    return currencyBalances.map(({ currency, balance, balanceHUF, fill }) => (
                      <div key={currency} className={styles.balanceRow}>
                        <div className={styles.balanceMeta}>
                          <span className={styles.balanceCurrency}>{currency}</span>
                          <span className={[styles.balanceAmount, balance >= 0 ? styles.balancePos : styles.balanceNeg].join(' ')}>
                            {formatCurrency(balance, currency as Currency)}
                          </span>
                        </div>
                        <div className={styles.balanceBar}>
                          <div
                            className={styles.balanceBarFill}
                            style={{ width: `${maxHUF > 0 ? Math.min(100, Math.abs(balanceHUF) / maxHUF * 100) : 100}%`, backgroundColor: fill }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Top spenders */}
              {topCategories.length > 0 && (
                <>
                  <h3 className={styles.cardSubheading}>Top Expense Categories</h3>
                  <div className={styles.topList}>
                    {topCategories.map((s, i) => (
                      <div key={i} className={styles.topRow}>
                        <span className={styles.topRank}>{i + 1}</span>
                        <span className={styles.topDot} style={{ backgroundColor: s.color }} />
                        <span className={styles.topName}>{s.name}</span>
                        <span className={styles.topAmount}>{formatHUF(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Period comparison ── */}
            <div className={[styles.card, styles.cardWide].join(' ')}>
              <h2 className={styles.cardTitle}>Expense Comparison by Category</h2>
              <p className={styles.cardSubtitle}>{period.label} vs {prevLabel}</p>
              {comparisonData.length === 0 ? (
                <p className={styles.empty}>No expense data to compare.</p>
              ) : mounted && (
                <ResponsiveContainer width="100%" height={comparisonData.length * 52 + 40}>
                  <BarChart data={comparisonData} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }} tickFormatter={v => formatHUF(v)} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-2)' }} />
                    <Bar dataKey="current" name={period.label} fill="#f26e4d" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    <Bar dataKey="prev" name={prevLabel} fill="#7e5ec4" radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {comparisonData.length > 0 && (
                <div className={styles.compLegend}>
                  <span className={styles.compDot} style={{ backgroundColor: '#f26e4d' }} /><span>{period.label}</span>
                  <span className={styles.compDot} style={{ backgroundColor: '#7e5ec4' }} /><span style={{ color: 'var(--color-text-muted)' }}>{prevLabel}</span>
                </div>
              )}
            </div>

            {/* ── Spending trend ── */}
            <div className={[styles.card, styles.cardWide].join(' ')}>
              <h2 className={styles.cardTitle}>Income & Expense Trend</h2>
              <p className={styles.cardSubtitle}>{period.label}</p>
              {trendData.every(d => d.income === 0 && d.expense === 0) ? (
                <p className={styles.empty}>No data for this period.</p>
              ) : mounted && (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc2626" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }} tickFormatter={v => formatHUF(v)} axisLine={false} tickLine={false} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="income" name="Income" stroke="#16a34a" strokeWidth={2} fill="url(#gradIncome)" dot={false} />
                    <Area type="monotone" dataKey="expense" name="Expense" stroke="#dc2626" strokeWidth={2} fill="url(#gradExpense)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              <div className={styles.compLegend}>
                <span className={styles.compDot} style={{ backgroundColor: '#16a34a' }} /><span>Income</span>
                <span className={styles.compDot} style={{ backgroundColor: '#dc2626' }} /><span>Expense</span>
              </div>
            </div>

          </div>

        </div>
    </AppShell>
  );
}
