import { NextRequest, NextResponse } from 'next/server';
import { CURRENCIES, parseCurrency } from '@/lib/baseCurrency';

// Frankfurter (ECB rates). A weekend or holiday date returns the previous business day's rates.
const FRANKFURTER = 'https://api.frankfurter.app';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  const base = parseCurrency(req.nextUrl.searchParams.get('base') ?? 'HUF');
  if (!base) {
    return NextResponse.json({ error: 'Invalid base currency' }, { status: 400 });
  }

  try {
    // Fetch base-based rates and invert them: with base HUF, 0.00254 EUR per HUF → 393.7 HUF per EUR.
    const others = CURRENCIES.filter(c => c !== base).join(',');
    const res = await fetch(`${FRANKFURTER}/${date}?from=${base}&to=${others}`);

    if (!res.ok) return NextResponse.json({ rates: {} });

    const data: { date: string; base: string; rates: Record<string, number> } = await res.json();

    const rates: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(data.rates ?? {})) {
      if (rate > 0) rates[currency] = 1 / rate;
    }

    return NextResponse.json({ rates, publishedDate: data.date });
  } catch {
    return NextResponse.json({ rates: {} });
  }
}
