import { NextRequest, NextResponse } from 'next/server';

// Frankfurter API — ECB reference rates, free & cloud-accessible.
// Returns EUR-based rates; we derive HUF-per-X from those.
// Automatically resolves to the nearest published business day.
const FRANKFURTER = 'https://api.frankfurter.app';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  try {
    // Fetch all rates with EUR as the base for a single round-trip.
    // ?base=EUR gives { rates: { HUF: 404.23, USD: 1.1302, GBP: 0.8612, … } }
    const res = await fetch(`${FRANKFURTER}/${date}?base=EUR`, {
      next: { revalidate: 86400 }, // cache at the edge for 24 h
    });

    if (!res.ok) return NextResponse.json({ rates: {} });

    const data: { date: string; base: string; rates: Record<string, number> } = await res.json();
    const eurToHUF = data.rates['HUF'];
    if (!eurToHUF) return NextResponse.json({ rates: {} });

    // Convert each currency to "HUF per 1 unit"
    const rates: Record<string, number> = { EUR: eurToHUF };
    for (const [currency, eurRate] of Object.entries(data.rates)) {
      if (currency !== 'HUF') {
        rates[currency] = eurToHUF / eurRate;
      }
    }

    return NextResponse.json({ rates, publishedDate: data.date });
  } catch {
    return NextResponse.json({ rates: {} });
  }
}
