// Module-level cache — persists across renders, cleared on page reload
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

/** Convert an amount in any currency to HUF. Falls back to the raw amount if rate is unavailable. */
export function toHUF(amount: number, currency: string | undefined, rates: Record<string, number>): number {
  if (!currency || currency === 'HUF') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}

/** Like toHUF but prefers a stored per-transaction rate over a live lookup map. */
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
