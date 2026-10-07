import { createClient } from './supabase/client';
import type { Transaction, Wallet, Category, Label } from './types';

const BATCH = 1000;

/** All rows for the user, fetched 1000 at a time to get past PostgREST's row limit. */
export async function fetchAllRows<T = Record<string, unknown>>(
  table: string,
  userId: string,
  select = '*',
  orderBy = 'created_at',
): Promise<T[]> {
  const supabase = createClient();
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('user_id', userId)
      .order(orderBy, { ascending: true })
      .range(from, from + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < BATCH) break;
    from += BATCH;
  }

  return rows;
}

type RawTx = Omit<Transaction, 'labels'> & { labels: { label_id: string }[] };

/** Transactions in [from, to] (either bound optional), oldest first, with label ids. */
export async function fetchTransactionsForExport(
  userId: string,
  from: string | null,
  to: string | null,
): Promise<(Transaction & { label_ids: string[] })[]> {
  const supabase = createClient();
  const rows: (Transaction & { label_ids: string[] })[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from('transactions')
      .select('*, labels:transaction_labels(label_id)')
      .eq('user_id', userId);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    const { data, error } = await q
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as RawTx[]).map(({ labels, ...t }) => ({
      ...t,
      label_ids: (labels ?? []).map(l => l.label_id),
    })));
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  return rows;
}

function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  // The importer reads one record per line.
  let s = String(v).replace(/\r\n|\r|\n/g, ' ');
  // Prefix formula-like text with ' so Excel/Sheets don't run it; the importer strips it.
  if (typeof v === 'string' && /^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADERS = [
  'Date', 'Type', 'Amount', 'Currency', 'Account',
  'To account', 'To amount', 'To currency',
  'Category', 'Parent category', 'Notes', 'Payer', 'Labels',
] as const;

/** Same shape the importer reads: one row per income/expense, one "Transfer" row per transfer pair. */
export function buildTransactionsCsv(
  txs: (Transaction & { label_ids: string[] })[],
  wallets: Wallet[],
  categories: Category[],
  labels: Label[],
): string {
  const walletById = new Map(wallets.map(w => [w.id, w]));
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const labelById = new Map(labels.map(l => [l.id, l]));

  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!t.transfer_group_id) continue;
    const g = groups.get(t.transfer_group_id) ?? [];
    g.push(t);
    groups.set(t.transfer_group_id, g);
  }

  const lines: string[] = [CSV_HEADERS.join(',')];
  const emitted = new Set<string>();

  for (const t of txs) {
    const labelNames = t.label_ids
      .map(id => labelById.get(id)?.name)
      .filter(Boolean)
      .join(' | ');

    const group = t.transfer_group_id ? groups.get(t.transfer_group_id) : undefined;
    const out = group?.find(g => g.type === 'expense');
    const inc = group?.find(g => g.type === 'income');

    if (group && group.length === 2 && out && inc) {
      if (emitted.has(t.transfer_group_id!)) continue;
      emitted.add(t.transfer_group_id!);
      const src = walletById.get(out.wallet_id);
      const dst = walletById.get(inc.wallet_id);
      lines.push([
        out.date, 'Transfer', out.amount, src?.currency, src?.name,
        dst?.name, inc.amount, dst?.currency,
        '', '', out.notes, out.payer, labelNames,
      ].map(csvField).join(','));
      continue;
    }

    const wallet = walletById.get(t.wallet_id);
    const category = t.category_id ? categoryById.get(t.category_id) : undefined;
    const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
    lines.push([
      t.date, t.type === 'income' ? 'Income' : 'Expense', t.amount, wallet?.currency, wallet?.name,
      '', '', '',
      category?.name, parent?.name, t.notes, t.payer, labelNames,
    ].map(csvField).join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

export function downloadFile(content: string, fileName: string, mime: string) {
  // BOM so Excel reads UTF-8.
  const body = mime.startsWith('text/csv') ? '﻿' + content : content;
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
