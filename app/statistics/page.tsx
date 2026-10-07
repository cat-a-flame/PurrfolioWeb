'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCountUp } from '@/lib/useCountUp';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmojiBox from '@/components/ui/EmojiBox';
import EmptyState from '@/components/ui/EmptyState';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import Skeleton from '@/components/ui/Skeleton';
import { createClient } from '@/lib/supabase/client';
import { fetchTransactions } from '@/lib/supabase/fetchTransactions';
import { getExchangeRates, getRatesForTransactions, toHUF, txToHUF } from '@/lib/exchangeRates';
import { formatHUF, formatNumber } from '@/lib/utils';
import { generateDueDates, isoDate as recurringIsoDate } from '@/lib/recurringUtils';
import type { Transaction, RecurringPayment, RecurringOccurrence, TransactionType } from '@/lib/types';
import styles from './page.module.css';

const PALETTE = [
  '#f26e4d','#f59e0b','#10b981','#6366f1','#ec4899',
  '#14b8a6','#8b5cf6','#f97316','#06b6d4','#84cc16',
  '#a78bfa','#fb7185','#0ea5e9','#d946ef','#22c55e',
];

// Categories under this amount (HUF) in the period are folded into "Other"
const OTHER_THRESHOLD_HUF = 5_000;
const OTHER_COLOR = '#94a3b8';
// Category rows shown before "Show N more categories"
const VISIBLE_CATEGORIES = 8;

function formatShare(share: number): string {
  const pct = Math.round(share * 100);
  return pct === 0 && share > 0 ? '<1%' : `${pct}%`;
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

// "August" / "December 2025" / "2025" / "the previous week", for "… in <name>" copy
function prevPeriodName(v: PeriodValue, fallback: string): string {
  const prev = getPrevRange(v);
  const prevFrom = new Date(prev.from + 'T12:00:00');
  if (v.tab === 'months') {
    const sameYear = prevFrom.getFullYear() === new Date(v.from + 'T12:00:00').getFullYear();
    return prevFrom.toLocaleDateString('en-GB', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
  }
  if (v.tab === 'years') return String(prevFrom.getFullYear());
  return `the ${fallback}`;
}

function filterRange(txs: Transaction[], from: string, to: string) {
  return txs.filter(t => t.date >= from && t.date <= to);
}

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

function changeInfo(current: number, prev: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (Math.abs(current - prev) < 1) return { text: 'no change', tone: 'flat' };
  if (prev <= 0) return { text: 'new', tone: 'up' };
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return { text: 'no change', tone: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'up' : 'down' };
}

const HISTORY_MONTHS = 6;
// Minimum history buckets a category must appear in to count as a pattern.
const MIN_BUCKETS_SEEN = 2;
const MAX_PREDICTIONS_PER_TYPE = 10;

const AVG_DAYS_PER_MONTH = 365.25 / 12;

// Whole calendar months count exactly; other periods are pro-rated by days.
function periodLengthInMonths(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00');
  const to   = new Date(toIso   + 'T00:00:00');
  const dayAfterTo = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  if (from.getDate() === 1 && dayAfterTo.getDate() === 1) {
    return (dayAfterTo.getFullYear() * 12 + dayAfterTo.getMonth()) - (from.getFullYear() * 12 + from.getMonth());
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  return Math.max(1, days) / AVG_DAYS_PER_MONTH;
}

type PredictionItem = {
  key: string;
  title: string;
  subtitle: string;
  type: TransactionType;
  icon: string;
  color: string;
  confidencePct: number;
  predictedAmount: number;
  isStable: boolean;
  rangeLow: number;
  rangeHigh: number;
};

// Mean and coefficient of variation of per-bucket totals, for the confidence score.
function sampleStats(samples: number[]): { mean: number; cv: number } {
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  if (mean <= 0) return { mean, cv: 0 };
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  return { mean, cv: Math.sqrt(variance) / mean };
}

function PredictionPanel({ variant, title, subtitle, items, loading }: {
  variant: 'income' | 'expense';
  title: string;
  subtitle: string;
  items: PredictionItem[];
  loading: boolean;
}) {
  const isIncome = variant === 'income';
  const sign = isIncome ? '+' : '−';
  return (
    <div className={styles.card}>
      <div>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.cardSubtitle}>{subtitle}</p>
      </div>
      {loading ? (
        <div className={styles.predictionList}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} width="100%" height={54} radius={8} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState compact icon={isIncome ? '💰' : '🧾'} hint={`No recurring ${variant} pattern found yet.`} />
      ) : (
        <table className={styles.predictionTable}>
          <colgroup>
            <col className={styles.predictionColCategory} />
            <col />
            <col className={styles.predictionColConfidence} />
            <col className={styles.predictionColAmount} />
          </colgroup>
          <tbody>
            {items.map(item => (
              <tr key={item.key} className={styles.predictionRow}>
                <td className={styles.predictionCellCategory}>
                  <EmojiBox emoji={item.icon} color={item.color} size="sm" />
                </td>
                <td className={styles.predictionCellMain}>
                  <div className={styles.predictionMain}>
                    <span className={styles.predictionTitle}>{item.title}</span>
                    <span className={styles.predictionSubtitle}>{item.subtitle}</span>
                  </div>
                </td>
                <td className={styles.predictionCellConfidence}>
                  <div className={styles.predictionConfidence}>
                    <span className={styles.predictionConfidenceLabel}>{item.confidencePct}% sure</span>
                    <div className={styles.predictionConfidenceTrack}>
                      <div
                        className={[styles.predictionConfidenceFill, isIncome ? styles.predictionConfidenceFillIncome : styles.predictionConfidenceFillExpense].join(' ')}
                        style={{ width: `${item.confidencePct}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className={styles.predictionCellAmount}>
                  <div className={styles.predictionAmountCol}>
                    <span className={[styles.predictionAmount, isIncome ? styles.statAmountIncome : styles.statAmountExpense].join(' ')}>
                      {sign}{formatHUF(item.predictedAmount)}
                    </span>
                    <span className={styles.predictionRangeText}>
                      {item.isStable ? 'stable' : `${formatNumber(Math.round(item.rangeLow))} – ${formatNumber(Math.round(item.rangeHigh))}`}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function StatisticsPage() {
  const [allTxs, setAllTxs]   = useState<Transaction[]>([]);
  const [prevTxsData, setPrevTxsData] = useState<Transaction[]>([]);
  const [historyTxs, setHistoryTxs] = useState<Transaction[]>([]);
  const [historyRange, setHistoryRange] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // Period refetch in progress (`loading` only covers the first load).
  const [periodLoading, setPeriodLoading] = useState(false);
  const [period, setPeriod]   = useState<PeriodValue>(defaultPeriod);
  const [todayRates, setTodayRates] = useState<Record<string, number>>({});
  const [ratesByDate, setRatesByDate] = useState<Record<string, Record<string, number>>>({});
  const [recurringPayments, setRecurringPayments]     = useState<RecurringPayment[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<RecurringOccurrence[]>([]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const from = new Date(period.from + 'T00:00:00');
    const to   = new Date(period.to   + 'T00:00:00');
    const prev = getPrevRange(period);
    const now = new Date();
    // Last HISTORY_MONTHS full months; the current month is excluded.
    const histFrom = isoDate(new Date(now.getFullYear(), now.getMonth() - HISTORY_MONTHS, 1));
    const histTo   = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    const [transactions, prevTransactions, historyTransactions, pmtRes, occRes] = await Promise.all([
      fetchTransactions(user.id, period.from, period.to),
      fetchTransactions(user.id, prev.from, prev.to),
      fetchTransactions(user.id, histFrom, histTo),
      supabase.from('recurring_payments').select('*, wallet:wallets(*), category:categories(*)').eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id)
        .gte('due_date', recurringIsoDate(from)).lte('due_date', recurringIsoDate(to)),
    ]);

    // Load rates before rendering so totals don't change after the skeleton.
    const [rates, today] = await Promise.all([
      getRatesForTransactions([...transactions, ...prevTransactions, ...historyTransactions]),
      getExchangeRates(isoDate(new Date())),
    ]);

    setRatesByDate(prevRates => ({ ...prevRates, ...rates }));
    setTodayRates(today);
    setAllTxs(transactions);
    setPrevTxsData(prevTransactions);
    setHistoryTxs(historyTransactions);
    setHistoryRange({ from: histFrom, to: histTo });
    if (pmtRes.data) setRecurringPayments(pmtRes.data as RecurringPayment[]);
    if (occRes.data) setRecurringOccurrences(occRes.data);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    setPeriodLoading(true);
    fetchData().finally(() => setPeriodLoading(false));
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

  const income  = useMemo(() => periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0), [periodTxs, ratesByDate]);
  const expense = useMemo(() => periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0), [periodTxs, ratesByDate]);
  const prevExpense = useMemo(() => prevTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}), 0), [prevTxs, ratesByDate]);

  const txCount = periodTxs.filter(t => !t.transfer_group_id).length;
  const incomeCount  = periodTxs.filter(t => t.type === 'income'  && !t.transfer_group_id).length;
  const expenseCount = periodTxs.filter(t => t.type === 'expense' && !t.transfer_group_id).length;
  const animatedIncome  = useCountUp(income);
  const animatedExpense = useCountUp(expense);
  const animatedNet     = useCountUp(income - expense);
  const animatedTxCount = useCountUp(txCount);

  const cashFlowProjection = useMemo(() => {
    const from = new Date(period.from + 'T00:00:00');
    const to   = new Date(period.to   + 'T00:00:00');

    // Unpaid planned payments in the period, converted at today's rates.
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

    return { actualIncome: income, actualExpense: expense, plannedIncome, plannedExpense };
  }, [period, income, expense, recurringPayments, recurringOccurrences, todayRates]);

  const [showAllCategories, setShowAllCategories] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);

  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, { amount: number; icon: string; color: string }>();
    for (const t of periodTxs) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name  = t.category?.name  ?? 'Uncategorised';
      const prev  = map.get(name) ?? { amount: 0, icon: t.category?.icon ?? '📁', color: t.category?.color ?? OTHER_COLOR };
      map.set(name, { ...prev, amount: prev.amount + txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {}) });
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.amount, 0);
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, v], i) => ({
        name,
        icon: v.icon,
        amount: v.amount,
        color: v.color !== OTHER_COLOR ? v.color : PALETTE[i % PALETTE.length],
        share: total > 0 ? v.amount / total : 0,
      }));
    const main  = rows.filter(r => r.amount >= OTHER_THRESHOLD_HUF);
    const small = rows.filter(r => r.amount <  OTHER_THRESHOLD_HUF);
    const otherAmount = small.reduce((s, r) => s + r.amount, 0);
    return {
      total,
      categoryCount: rows.length,
      main,
      small,
      other: small.length > 0 ? { amount: otherAmount, share: total > 0 ? otherAmount / total : 0 } : null,
      maxAmount: Math.max(1, ...main.map(r => r.amount)),
    };
  }, [periodTxs, ratesByDate]);

  const comparisonData = useMemo(() => {
    const catMap = new Map<string, { current: number; prev: number; icon: string; color: string }>();
    for (const t of [...periodTxs, ...prevTxs]) {
      if (t.type !== 'expense' || t.transfer_group_id) continue;
      const name  = t.category?.name  ?? 'Uncategorised';
      const icon  = t.category?.icon  ?? '📁';
      const color = t.category?.color ?? '#94a3b8';
      if (!catMap.has(name)) catMap.set(name, { current: 0, prev: 0, icon, color });
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
      .map(([name, v]) => ({ name, icon: v.icon, color: v.color, current: Math.round(v.current), prev: Math.round(v.prev) }));
  }, [periodTxs, prevTxs, ratesByDate]);

  // Per category (or per payer when one dominates): months seen out of 6, typical monthly
  // total and its spread, scaled to the period. Needs MIN_BUCKETS_SEEN months to count.
  const predictions = useMemo(() => {
    if (!historyRange) return { income: [] as PredictionItem[], expense: [] as PredictionItem[] };

    const histFrom = new Date(historyRange.from + 'T00:00:00');
    const histStartMonth = histFrom.getFullYear() * 12 + histFrom.getMonth();
    const scale = periodLengthInMonths(period.from, period.to);

    type Group = {
      name: string;
      icon: string;
      color: string;
      type: TransactionType;
      totalCount: number;
      buckets: Map<number, number>; // bucket index -> HUF sum
      payerCounts: Map<string, number>;
    };
    const map = new Map<string, Group>();

    for (const t of historyTxs) {
      if (t.transfer_group_id) continue;
      const key = `${t.type}|${t.category_id ?? 'none'}`;
      const g = map.get(key) ?? {
        name: t.category?.name ?? 'Uncategorised',
        icon: t.category?.icon ?? '📁',
        color: t.category?.color ?? '#94a3b8',
        type: t.type,
        totalCount: 0,
        buckets: new Map<number, number>(),
        payerCounts: new Map<string, number>(),
      };
      const amount = txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, ratesByDate[t.date] ?? {});
      const txDate = new Date(t.date + 'T00:00:00');
      const bucketIdx = txDate.getFullYear() * 12 + txDate.getMonth() - histStartMonth;
      if (bucketIdx < 0 || bucketIdx >= HISTORY_MONTHS) continue;
      g.buckets.set(bucketIdx, (g.buckets.get(bucketIdx) ?? 0) + amount);
      g.totalCount += 1;
      if (t.payer) g.payerCounts.set(t.payer, (g.payerCounts.get(t.payer) ?? 0) + 1);
      map.set(key, g);
    }

    const items: PredictionItem[] = [];
    for (const [key, g] of map) {
      const bucketsSeen = g.buckets.size;
      const samples = Array.from(g.buckets.values()).filter(v => v > 0);
      if (bucketsSeen < MIN_BUCKETS_SEEN || samples.length === 0) continue;

      const { mean, cv } = sampleStats(samples);
      if (mean <= 0) continue;

      const isAggregate = g.totalCount / bucketsSeen > 1.3;
      let title = g.name;
      if (!isAggregate) {
        let dominantPayer: string | null = null;
        let dominantCount = 0;
        for (const [payer, count] of g.payerCounts) {
          if (count > dominantCount) { dominantPayer = payer; dominantCount = count; }
        }
        if (dominantPayer && dominantCount / g.totalCount >= 0.6) title = `${g.name} — ${dominantPayer}`;
      }
      const subtitle = isAggregate
        ? `${g.totalCount} entries / ${HISTORY_MONTHS} months`
        : `seen ${bucketsSeen} of ${HISTORY_MONTHS} months`;

      const presenceRatio = bucketsSeen / HISTORY_MONTHS;
      const consistency = Math.max(0, 1 - cv);
      const confidencePct = Math.max(1, Math.min(99, Math.round(100 * (0.55 * presenceRatio + 0.45 * consistency))));

      items.push({
        key,
        title,
        subtitle,
        type: g.type,
        icon: g.icon,
        color: g.color,
        confidencePct,
        predictedAmount: mean * scale,
        isStable: cv <= 0.08,
        rangeLow: Math.min(...samples) * scale,
        rangeHigh: Math.max(...samples) * scale,
      });
    }

    // Most reliable first: confidence, then typical amount.
    const byReliability = (a: PredictionItem, b: PredictionItem) =>
      b.confidencePct - a.confidencePct || b.predictedAmount - a.predictedAmount;

    const income  = items.filter(i => i.type === 'income');
    const expense = items.filter(i => i.type === 'expense');
    return {
      income:  [...income].sort(byReliability).slice(0, MAX_PREDICTIONS_PER_TYPE),
      expense: [...expense].sort(byReliability).slice(0, MAX_PREDICTIONS_PER_TYPE),
    };
  }, [historyTxs, historyRange, period, ratesByDate]);

  const showSkeleton = loading || periodLoading;
  const prevLabel = period.tab === 'months' ? 'previous month' : period.tab === 'years' ? 'previous year' : period.tab === 'weeks' ? 'previous week' : 'previous period';
  const prevName = prevPeriodName(period, prevLabel);

  return (
    <AppShell>
        <div className={styles.container}>

          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Statistics</h1>
          </div>

          <div className={styles.periodRow}>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>

          {showSkeleton ? (
            <div className={styles.summaryRow}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.statCard}>
                  <div className={styles.statHead}>
                    <Skeleton width={38} height={38} radius="var(--radius-md)" />
                    <Skeleton width={64} height={11} radius={4} />
                  </div>
                  <Skeleton width={110} height={26} radius={6} />
                  <div className={styles.statDivider} />
                  <Skeleton width="80%" height={12} radius={4} />
                </div>
              ))}
            </div>
          ) : (() => {
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

          <div className={styles.grid}>

            <div className={[styles.card, styles.cardWide].join(' ')}>
              <div className={styles.catHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Expenses by category</h2>
                  <p className={styles.cardSubtitle}>{period.label}</p>
                </div>
                {!showSkeleton && expenseBreakdown.categoryCount > 0 && (
                  <div className={styles.catTotal}>
                    <span className={styles.catTotalAmount}>{formatHUF(Math.round(expenseBreakdown.total))}</span>
                    <span className={styles.catTotalCount}>
                      {expenseBreakdown.categoryCount} {expenseBreakdown.categoryCount === 1 ? 'category' : 'categories'}
                    </span>
                  </div>
                )}
              </div>
              {showSkeleton ? (
                <>
                  <Skeleton width="100%" height={20} radius={999} />
                  <div className={styles.catSkeletonList}>
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={44} radius={8} />)}
                  </div>
                </>
              ) : expenseBreakdown.categoryCount === 0 ? (
                <EmptyState compact icon="🍩" hint="No expenses in this period." />
              ) : (() => {
                const { main, small, other, maxAmount } = expenseBreakdown;
                const visible = showAllCategories ? main : main.slice(0, VISIBLE_CATEGORIES);
                const hiddenCount = main.length - VISIBLE_CATEGORIES;
                return (
                  <>
                    <div className={styles.catStack} role="img" aria-label="Share of spending by category">
                      {main.map(r => (
                        <span key={r.name} className={styles.catStackSegment} style={{ flexGrow: r.amount, backgroundColor: r.color }} title={`${r.name}: ${formatShare(r.share)}`} />
                      ))}
                      {other && (
                        <span className={styles.catStackSegment} style={{ flexGrow: other.amount, backgroundColor: OTHER_COLOR }} title={`Other: ${formatShare(other.share)}`} />
                      )}
                    </div>

                    {main.length > 0 && (
                      <ul className={styles.catList}>
                        {visible.map(r => (
                          <li key={r.name} className={styles.catRow}>
                            <EmojiBox emoji={r.icon} color={r.color} size="sm" />
                            <div className={styles.catMain}>
                              <span className={styles.catName}>{r.name}</span>
                              <div className={styles.catBarTrack}>
                                <div className={styles.catBarFill} style={{ width: `${(r.amount / maxAmount) * 100}%`, backgroundColor: r.color }} />
                              </div>
                            </div>
                            <span className={styles.catPct}>{formatShare(r.share)}</span>
                            <span className={styles.catAmount}>{formatHUF(Math.round(r.amount))}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {hiddenCount > 0 && (
                      <Button variant="secondary" size="sm" className={styles.catMoreBtn} onClick={() => setShowAllCategories(v => !v)}>
                        {showAllCategories ? 'Show fewer categories' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'category' : 'categories'}`}
                      </Button>
                    )}

                    {other && (
                      <div className={main.length > 0 ? styles.catOther : undefined}>
                        <button
                          type="button"
                          className={[styles.catRow, styles.catOtherRow].join(' ')}
                          onClick={() => setOtherExpanded(v => !v)}
                          aria-expanded={otherExpanded}
                        >
                          <EmojiBox emoji="📁" color={OTHER_COLOR} size="sm" />
                          <span className={styles.catOtherLabel}>
                            <span className={styles.catName}>Other</span>
                            <span className={styles.catOtherHint}>{small.length} under {formatHUF(OTHER_THRESHOLD_HUF)}</span>
                            <svg className={[styles.chevron, otherExpanded ? styles.chevronOpen : ''].filter(Boolean).join(' ')} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                          <span className={styles.catPct}>{formatShare(other.share)}</span>
                          <span className={styles.catAmount}>{formatHUF(Math.round(other.amount))}</span>
                        </button>
                        {otherExpanded && (
                          <ul className={[styles.catList, styles.catSubList].join(' ')}>
                            {small.map(r => (
                              <li key={r.name} className={[styles.catRow, styles.catSubRow].join(' ')}>
                                <EmojiBox emoji={r.icon} color={r.color} size="sm" />
                                <span className={styles.catName}>{r.name}</span>
                                <span className={styles.catPct}>{formatShare(r.share)}</span>
                                <span className={styles.catAmount}>{formatHUF(Math.round(r.amount))}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className={[styles.card, styles.cardWide].join(' ')}>
              <div className={styles.compHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Expense comparison by category</h2>
                  <p className={styles.cardSubtitle}>{period.label} vs {prevLabel}</p>
                </div>
                {!showSkeleton && comparisonData.length > 0 && (
                  <div className={styles.compLegend}>
                    <span className={styles.compLegendItem}>
                      <span className={[styles.compDot, styles.compDotCurrent].join(' ')} />{period.label}
                    </span>
                    <span className={styles.compLegendItem}>
                      <span className={[styles.compDot, styles.compDotPrev].join(' ')} />{prevLabel}
                    </span>
                  </div>
                )}
              </div>
              {showSkeleton ? (
                <div className={styles.compSkeletonList}>
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={56} radius={8} />)}
                </div>
              ) : comparisonData.length === 0 ? (
                <EmptyState compact icon="📊" hint="No expense data to compare." />
              ) : (() => {
                const maxValue = Math.max(1, ...comparisonData.flatMap(c => [c.current, c.prev]));
                return (
                  <div className={styles.compList}>
                    {comparisonData.map(c => {
                      const change = changeInfo(c.current, c.prev);
                      const changeClass = change.tone === 'up' ? styles.compChangeUp : change.tone === 'down' ? styles.compChangeDown : styles.compChangeFlat;
                      return (
                        <div key={c.name} className={styles.compRow}>
                          <div className={styles.compCategory}>
                            <EmojiBox emoji={c.icon} color={c.color} size="sm" />
                            <span className={styles.compName}>{c.name}</span>
                          </div>
                          <div className={styles.compBars}>
                            <div className={styles.compBarTrack}>
                              <div className={styles.compBarFillCurrent} style={{ width: `${(c.current / maxValue) * 100}%` }} />
                            </div>
                            <div className={styles.compBarTrack}>
                              <div className={styles.compBarFillPrev} style={{ width: `${(c.prev / maxValue) * 100}%` }} />
                            </div>
                          </div>
                          <div className={styles.compAmounts}>
                            <span className={styles.compAmountCurrent}>{formatHUF(c.current)}</span>
                            <span className={styles.compAmountPrev}>was {formatHUF(c.prev)}</span>
                          </div>
                          <span className={[styles.compChangeBadge, changeClass].join(' ')}>{change.text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {!showSkeleton && comparisonData.length > 0 && (() => {
                const change = changeInfo(expense, prevExpense);
                const changeClass = change.tone === 'up' ? styles.compChangeUp : change.tone === 'down' ? styles.compChangeDown : styles.compChangeFlat;
                return (
                  <div className={styles.compTotal}>
                    <span className={styles.compTotalLabel}>Total spent</span>
                    <div className={styles.compTotalFigures}>
                      <span className={styles.compTotalAmount}>{formatHUF(Math.round(expense))}</span>
                      <span className={styles.compTotalPrev}>vs {formatHUF(Math.round(prevExpense))} in {prevName}</span>
                      <span className={[styles.compChangeBadge, changeClass].join(' ')}>{change.text}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <PredictionPanel
              variant="expense"
              title="Expected expenses"
              subtitle={`${period.label} · based on the last ${HISTORY_MONTHS} months`}
              items={predictions.expense}
              loading={showSkeleton}
            />
            <PredictionPanel
              variant="income"
              title="Expected income"
              subtitle={`${period.label} · based on the last ${HISTORY_MONTHS} months`}
              items={predictions.income}
              loading={showSkeleton}
            />

          </div>

        </div>
    </AppShell>
  );
}
