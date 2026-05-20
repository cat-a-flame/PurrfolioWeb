'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCountUp } from '@/lib/useCountUp';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
  type PieLabelRenderProps,
} from 'recharts';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import { createClient } from '@/lib/supabase/client';
import { fetchAllTransactions } from '@/lib/supabase/fetchAllTransactions';
import { getExchangeRates, toHUF } from '@/lib/exchangeRates';
import { formatCurrency, formatHUF, formatNumber } from '@/lib/utils';
import type { Transaction, Wallet, Currency } from '@/lib/types';
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

// ─── page ────────────────────────────────────────────────────────────────────
export default function StatisticsPage() {
  const [allTxs, setAllTxs]   = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod]   = useState<PeriodValue>(defaultPeriod);
  const [todayRates, setTodayRates] = useState<Record<string, number>>({});
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const today = isoDate(new Date());
    getExchangeRates(today).then(setTodayRates);
  }, []);

  useEffect(() => {
    const dates = [...new Set(
      allTxs
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
  }, [allTxs]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [transactions, wRes] = await Promise.all([
      fetchAllTransactions(user.id),
      supabase.from('wallets').select('*').eq('user_id', user.id),
    ]);
    setAllTxs(transactions);
    if (wRes.data) setWallets(wRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); window.addEventListener('transaction-added', fetchData); return () => window.removeEventListener('transaction-added', fetchData); }, [fetchData]);

  const prevRange  = useMemo(() => getPrevRange(period), [period]);
  const periodTxs  = useMemo(() => filterRange(allTxs, period.from, period.to), [allTxs, period]);
  const prevTxs    = useMemo(() => filterRange(allTxs, prevRange.from, prevRange.to), [allTxs, prevRange]);

  // ── summary numbers ────────────────────────────────────────────────────
  const income  = useMemo(() => periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {}), 0), [periodTxs, ratesByDate]);
  const expense = useMemo(() => periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {}), 0), [periodTxs, ratesByDate]);

  const txCount = periodTxs.filter(t => !t.transfer_group_id).length;
  const animatedIncome  = useCountUp(income);
  const animatedExpense = useCountUp(expense);
  const animatedNet     = useCountUp(income - expense);
  const animatedTxCount = useCountUp(txCount);

  // ── 1. Balance by currency ──────────────────────────────────────────────
  const currencyBalances = useMemo(() => {
    const map = new Map<Currency, number>();
    for (const w of wallets) {
      const wTxs = allTxs.filter(t => t.wallet_id === w.id && !t.transfer_group_id);
      const bal  = w.starting_balance
        + wTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        - wTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      map.set(w.currency, (map.get(w.currency) ?? 0) + bal);
    }
    return Array.from(map.entries()).map(([currency, balance], i) => ({
      currency,
      balance,
      balanceHUF: toHUF(balance, currency, todayRates),
      fill: PALETTE[i % PALETTE.length],
    }));
  }, [allTxs, wallets, todayRates]);

  // ── 2. Expenses structure (doughnut) ──────────────────────────────────
  const [otherExpanded, setOtherExpanded] = useState(false);

  const { expenseSlices, otherItems } = useMemo(() => {
    const map = new Map<string, { amount: number; color: string }>();
    for (const t of periodTxs) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name  = t.category?.name  ?? 'Uncategorised';
      const color = t.category?.color ?? '#94a3b8';
      const prev  = map.get(name) ?? { amount: 0, color };
      map.set(name, { amount: prev.amount + toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {}), color });
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
      catMap.get(name)!.current += toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {});
    }
    for (const t of prevTxs) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name = t.category?.name ?? 'Uncategorised';
      catMap.get(name)!.prev += toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {});
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
        if (t.type === 'income')  v.income  += toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {});
        if (t.type === 'expense') v.expense += toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {});
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
        if (t.type === 'income')  v.income  += toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {});
        if (t.type === 'expense') v.expense += toHUF(t.amount, t.wallet?.currency, ratesByDate[t.date] ?? {});
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
    <div className={styles.layout}><AppHeader /><main className={styles.main}><p className={styles.loading}>Loading…</p></main><AppFooter /></div>
  );

  const prevLabel = period.tab === 'months' ? 'prev month' : period.tab === 'years' ? 'prev year' : period.tab === 'weeks' ? 'prev week' : 'prev period';

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Statistics</h1>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>

          {/* ── Summary row ── */}
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Income</span>
              <span className={[styles.summaryAmount, styles.summaryIncome].join(' ')}>{formatHUF(animatedIncome)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Expenses</span>
              <span className={[styles.summaryAmount, styles.summaryExpense].join(' ')}>{formatHUF(animatedExpense)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Net</span>
              <span className={[styles.summaryAmount, income - expense >= 0 ? styles.summaryIncome : styles.summaryExpense].join(' ')}>
                {income - expense >= 0 ? '+' : ''}{formatHUF(animatedNet)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Transactions</span>
              <span className={styles.summaryAmount}>{animatedTxCount}</span>
            </div>
          </div>

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
              <p className={styles.cardSubtitle}>Current total across all wallets</p>
              {currencyBalances.length === 0 ? (
                <p className={styles.empty}>No wallets yet.</p>
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
                    <Bar dataKey="prev" name={prevLabel} fill="var(--color-surface-3)" radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {comparisonData.length > 0 && (
                <div className={styles.compLegend}>
                  <span className={styles.compDot} style={{ backgroundColor: '#f26e4d' }} /><span>{period.label}</span>
                  <span className={styles.compDot} style={{ backgroundColor: 'var(--color-surface-3)' }} /><span style={{ color: 'var(--color-text-muted)' }}>{prevLabel}</span>
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
      </main>
      <AppFooter />
    </div>
  );
}
