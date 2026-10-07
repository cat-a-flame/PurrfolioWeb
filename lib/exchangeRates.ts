// Rates by date. Module-level, so it lasts until the page reloads.
const cache = new Map<string, Record<string, number>>();
const inflight = new Map<string, Promise<Record<string, number>>>();

export async function getExchangeRates(date: string): Promise<Record<string, number>> {
  if (cache.has(date)) return cache.get(date)!;
  if (inflight.has(date)) return inflight.get(date)!;

  const p = fetch(`/api/exchange-rates?date=${date}`)
    .then(r => r.ok ? r.json() : { rates: {} })
    .then((data: { rates?: Record<string, number> }) => {
      const rates = data.rates ?? {};
      cache.set(date, rates);
      inflight.delete(date);
      return rates;
    })
    .catch(() => {
      inflight.delete(date);
      return {};
    });

  inflight.set(date, p);
  return p;
}

/** HUF value of `amount`; returns `amount` unchanged if the rate is missing. */
export function toHUF(amount: number, currency: string | undefined, rates: Record<string, number>): number {
  if (!currency || currency === 'HUF') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}

/** Like toHUF, but a stored per-transaction rate wins. */
export function txToHUF(
  amount: number,
  currency: string | undefined,
  storedRate: number | null | undefined,
  ratesMap: Record<string, number>
): number {
  if (!currency || currency === 'HUF') return amount;
  if (storedRate != null) return amount * storedRate;
  return toHUF(amount, currency, ratesMap);
}

type RateLookupTx = {
  date: string;
  exchange_rate_to_huf: number | null;
  wallet?: { currency?: string } | null;
};

/** Rates per date for foreign-currency transactions without a stored rate. */
export async function getRatesForTransactions(
  transactions: RateLookupTx[],
): Promise<Record<string, Record<string, number>>> {
  const dates = [...new Set(
    transactions
      .filter(t => t.wallet?.currency && t.wallet.currency !== 'HUF' && t.exchange_rate_to_huf == null)
      .map(t => t.date)
  )];
  const entries = await Promise.all(dates.map(async d => [d, await getExchangeRates(d)] as const));
  return Object.fromEntries(entries);
}
