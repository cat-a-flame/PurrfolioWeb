import { NextRequest, NextResponse } from 'next/server';

// Frankfurter API — ECB reference rates, free & cloud-accessible.
// Fetches with HUF as base and inverts, matching Purrfolio's exchange.ts exactly.
// Automatically resolves to the nearest published business day.
const FRANKFURTER = 'https://api.frankfurter.app';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  try {
    // Match Purrfolio exactly: fetch with HUF as base, then invert each rate.
    // ?from=HUF gives { rates: { EUR: 0.00254, USD: 0.0028, … } }
    // Inverting gives HUF-per-unit: { EUR: 393.7, USD: 357.1, … }
    const res = await fetch(`${FRANKFURTER}/${date}?from=HUF&to=EUR,USD`);

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
