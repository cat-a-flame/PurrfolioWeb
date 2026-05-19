import { NextRequest, NextResponse } from 'next/server';

// MNB (Magyar Nemzeti Bank) SOAP API – returns középárfolyam
const MNB_ENDPOINT = 'https://www.mnb.hu/webservices/MNBArfolyamServiceSoap';
const CURRENCIES = 'EUR,USD,GBP,CHF,CZK,PLN,RON';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  // Look back 7 days to find the nearest published business-day rate
  const end = new Date(date + 'T12:00:00');
  const start = new Date(end);
  start.setDate(start.getDate() - 7);

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetExchangeRates xmlns="http://www.mnb.hu/webservices">
      <startDate>${isoDate(start)}</startDate>
      <endDate>${isoDate(end)}</endDate>
      <currencyNames>${CURRENCIES}</currencyNames>
    </GetExchangeRates>
  </soap:Body>
</soap:Envelope>`;

  try {
    const res = await fetch(MNB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
      body: soap,
      // Cache at the edge for 24 h — rates only publish once per business day
      next: { revalidate: 86400 },
    });

    if (!res.ok) return NextResponse.json({ rates: {} });

    const text = await res.text();

    // The result element contains HTML-encoded XML
    const resultMatch = text.match(/<GetExchangeRatesResult>([\s\S]*?)<\/GetExchangeRatesResult>/);
    if (!resultMatch) return NextResponse.json({ rates: {} });

    const inner = resultMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Find all <Day date="…">…</Day> blocks, take the most recent one
    const days = [...inner.matchAll(/<Day date="([^"]+)">([\s\S]*?)<\/Day>/g)];
    if (!days.length) return NextResponse.json({ rates: {} });

    days.sort((a, b) => b[1].localeCompare(a[1]));
    const [, publishedDate, ratesXml] = days[0];

    // Parse <Rate unit="1" curr="EUR">390,12</Rate>
    // MNB uses comma as decimal separator
    const rates: Record<string, number> = {};
    for (const [, unit, curr, value] of ratesXml.matchAll(/<Rate unit="(\d+)" curr="([^"]+)">([^<]+)<\/Rate>/g)) {
      const hufPerUnit = parseFloat(value.replace(',', '.'));
      const unitCount = parseInt(unit, 10);
      if (!isNaN(hufPerUnit) && unitCount > 0) {
        rates[curr] = hufPerUnit / unitCount; // HUF per 1 unit of currency
      }
    }

    return NextResponse.json({ rates, publishedDate });
  } catch {
    return NextResponse.json({ rates: {} });
  }
}
