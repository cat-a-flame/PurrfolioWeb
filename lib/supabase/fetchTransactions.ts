import { createClient } from './client';
import type { Transaction, Wallet, Category } from '../types';

type RawLabel = {
  label: { id: string; user_id: string; name: string; color: string; created_at: string } | null;
};
type RawRow = Omit<Transaction, 'labels'> & {
  wallet: Wallet | null;
  category: Category | null;
  labels: RawLabel[];
};

const SELECT =
  '*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))';
const BATCH = 1000;

export async function fetchTransactions(
  userId: string,
  from: string,
  to: string,
): Promise<Transaction[]> {
  const supabase = createClient();
  const rows: Transaction[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select(SELECT)
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(
      ...(data as RawRow[]).map(t => ({
        ...t,
        labels: t.labels
          .map(l => l.label)
          .filter((l): l is NonNullable<typeof l> => l !== null),
      }))
    );

    if (data.length < BATCH) break;
    offset += BATCH;
  }

  return rows;
}
