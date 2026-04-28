import { NextRequest, NextResponse } from 'next/server';
import { getHistory } from '@/lib/market';
import { generateMockHistory } from '@/lib/mockData';

export async function GET(req: NextRequest) {
  try {
    const rawSymbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();
    const symbol = rawSymbol && /^[A-Z]{1,10}$/.test(rawSymbol) ? rawSymbol : null;
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90');

    if (!symbol) {
      return NextResponse.json({ error: 'symbol parameter required' }, { status: 400 });
    }

    const clampedDays = Math.min(days, 365);
    let history = await getHistory(symbol, clampedDays);
    if (!history || history.length < 5) {
      history = generateMockHistory(symbol, clampedDays);
    }

    return NextResponse.json(
      { symbol, history },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
    );
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
