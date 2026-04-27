import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/market';
import { generateMockQuote } from '@/lib/mockData';

export async function GET(req: NextRequest) {
  try {
    const symbolsParam = req.nextUrl.searchParams.get('symbols');
    if (!symbolsParam) {
      return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 });
    }

    const symbols = symbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => /^[A-Z]{1,10}$/.test(s));

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
    }

    const results: Record<string, unknown> = {};

    // Try real API first, fall back to mock data so charts always render
    for (const symbol of symbols.slice(0, 20)) {
      try {
        const quote = await getQuote(symbol);
        if (quote) {
          results[symbol] = quote;
        } else {
          results[symbol] = generateMockQuote(symbol);
        }
      } catch {
        results[symbol] = generateMockQuote(symbol);
      }
    }

    return NextResponse.json({ quotes: results });
  } catch (error) {
    console.error('Quotes API error:', error);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}
