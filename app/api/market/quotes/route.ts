import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/market';
import { generateMockQuote } from '@/lib/mockData';

export const revalidate = 60; // ISR: revalidate every 60 seconds

export async function GET(req: NextRequest) {
  try {
    const symbolsParam = req.nextUrl.searchParams.get('symbols');
    if (!symbolsParam) {
      return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 });
    }

    const symbols = symbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => /^[A-Z]{1,10}$/.test(s))
      .slice(0, 25);

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
    }

    // Fetch all in parallel — Yahoo Finance handles concurrent requests fine
    const entries = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const quote = await getQuote(symbol);
          return [symbol, quote ?? generateMockQuote(symbol)] as const;
        } catch {
          return [symbol, generateMockQuote(symbol)] as const;
        }
      })
    );

    const quotes = Object.fromEntries(entries);

    return NextResponse.json(
      { quotes },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('Quotes API error:', error);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}
