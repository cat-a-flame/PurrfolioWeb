import { createClient } from './client';

const BATCH = 1000;

type Sums = Map<string, { income: number; expense: number }>;

/** Per-wallet income/expense totals from wallet_balance_sums(); sums client-side if it isn't installed. */
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

/** Fallback: sums wallet_id/type/amount in the browser. */
async function fetchWalletBalanceSumsClientSide(userId: string): Promise<Sums> {
  const supabase = createClient();
  const map: Sums = new Map();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('wallet_id, type, amount')
      .eq('user_id', userId)
      // range() paging needs a stable order, or rows get skipped or counted twice.
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
