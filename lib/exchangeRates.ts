import type { Currency } from './types';

// Rates are "base currency per 1 unit of the foreign currency", e.g. with base EUR: { HUF: 0.0025, USD: 0.92 }.
// Cached by base + date at module level, so it lasts until the page reloads.
const cache = new Map<string, Record<string, number>>();
const inflight = new Map<string, Promise<Record<string, number>>>();

export async function getExchangeRates(date: string, base: Currency): Promise<Record<string, number>> {
  const key = `${base}|${date}`;
  if (cache.has(key)) return cache.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;

  const p = fetch(`/api/exchange-rates?date=${date}&base=${base}`)
    .then(r => r.ok ? r.json() : { rates: {} })
    .then((data: { rates?: Record<string, number> }) => {
      const rates = data.rates ?? {};
      cache.set(key, rates);
      inflight.delete(key);
      return rates;
    })
    .catch(() => {
      inflight.delete(key);
      return {};
    });

  inflight.set(key, p);
  return p;
}

/** Value of `amount` in the base currency; returns `amount` unchanged if the rate is missing. */
export function toBase(
  amount: number,
  currency: string | undefined,
  rates: Record<string, number>,
  base: Currency,
): number {
  if (!currency || currency === base) return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}

/** Like toBase, but a stored per-transaction rate wins. */
export function txToBase(
  amount: number,
  currency: string | undefined,
  storedRate: number | null | undefined,
  ratesMap: Record<string, number>,
  base: Currency,
): number {
  if (!currency || currency === base) return amount;
  if (storedRate != null) return amount * storedRate;
  return toBase(amount, currency, ratesMap, base);
}

type RateLookupTx = {
  date: string;
  exchange_rate_to_huf: number | null;
  wallet?: { currency?: string } | null;
};

/** Rates per date for foreign-currency transactions without a stored rate. */
export async function getRatesForTransactions(
  transactions: RateLookupTx[],
  base: Currency,
): Promise<Record<string, Record<string, number>>> {
  const dates = [...new Set(
    transactions
      .filter(t => t.wallet?.currency && t.wallet.currency !== base && t.exchange_rate_to_huf == null)
      .map(t => t.date)
  )];
  const entries = await Promise.all(dates.map(async d => [d, await getExchangeRates(d, base)] as const));
  return Object.fromEntries(entries);
}
