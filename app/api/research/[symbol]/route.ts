import { NextRequest, NextResponse } from 'next/server';
import { getQuote, getHistory } from '@/lib/market';
import { computeIndicators } from '@/lib/indicators';
import { generateResearchAnalysis } from '@/lib/claude';
import { generateMockQuote, generateMockHistory } from '@/lib/mockData';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawParam } = await params;
    const symbol = rawParam.toUpperCase();

    // Validate symbol format to prevent injection
    if (!/^[A-Z]{1,10}$/.test(symbol)) {
      return NextResponse.json({ error: 'Invalid symbol format' }, { status: 400 });
    }

    let [quote, history] = await Promise.all([
      getQuote(symbol),
      getHistory(symbol, 90),
    ]);

    // Fall back to mock data so the page always renders
    if (!quote) quote = generateMockQuote(symbol);
    if (!history || history.length < 5) history = generateMockHistory(symbol, 90);

    const fullHistory = [
      ...history,
      {
        date: new Date().toISOString().split('T')[0],
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.price,
        volume: quote.volume,
      },
    ];

    const indicators = computeIndicators(symbol, fullHistory);

    const priceHistory = fullHistory.map(b => ({ date: b.date, close: b.close }));
    const analysis = await generateResearchAnalysis(symbol, indicators, priceHistory);

    return NextResponse.json({
      symbol,
      quote,
      history: fullHistory,
      indicators,
      analysis,
    });
  } catch (error) {
    console.error('Research API error:', error);
    return NextResponse.json({ error: 'Research analysis failed' }, { status: 500 });
  }
}
