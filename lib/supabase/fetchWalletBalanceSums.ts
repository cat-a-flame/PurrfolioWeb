import { createClient } from './client';

const BATCH = 1000;

type Sums = Map<string, { income: number; expense: number }>;

/**
 * Fetches per-wallet income/expense totals across all time.
 *
 * Uses the `wallet_balance_sums` database function (see
 * supabase/migrations/20260927000000_wallet_balance_sums.sql), which returns one
 * row per wallet. If that function isn't installed yet, falls back to summing
 * the transactions client-side.
 */
export async function fetchWalletBalanceSums(userId: string): Promise<Sums> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('wallet_balance_sums');

  if (!error && data) {
    const map: Sums = new Map();
    for (const row of data as { wallet_id: string; income: number | string; expense: number | string }[]) {
      map.set(row.wallet_id, { income: Number(row.income), expense: Number(row.expense) });
    }
    return map;
  }

  return fetchWalletBalanceSumsClientSide(userId);
}

/**
 * Fallback: pages through the three lightweight columns needed for the balance
 * calculation and sums them in the browser.
 */
async function fetchWalletBalanceSumsClientSide(userId: string): Promise<Sums> {
  const supabase = createClient();
  const map: Sums = new Map();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('wallet_id, type, amount')
      .eq('user_id', userId)
      // A stable order is required for range() paging, otherwise rows can be
      // skipped or counted twice across batches.
      .order('id')
      .range(from, from + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as { wallet_id: string; type: string; amount: number }[]) {
      const entry = map.get(row.wallet_id) ?? { income: 0, expense: 0 };
      if (row.type === 'income') entry.income += row.amount;
      else if (row.type === 'expense') entry.expense += row.amount;
      map.set(row.wallet_id, entry);
    }

    if (data.length < BATCH) break;
    from += BATCH;
  }

  return map;
}
