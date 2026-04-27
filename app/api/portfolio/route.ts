import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getQuote } from '@/lib/market';
import type { Position, PortfolioStats } from '@/types';

const MOCK_STATS = {
  totalValue: 100000,
  cashBalance: 100000,
  positionsValue: 0,
  totalPnl: 0,
  totalPnlPct: 0,
  todayPnl: 0,
  todayPnlPct: 0,
  winRate: 0,
  positions: [],
  snapshots: [],
};

export async function GET() {
  // Return mock data if Supabase is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http')) {
    return NextResponse.json({ portfolio: null, stats: MOCK_STATS });
  }

  try {
    const supabase = createAdminClient();

    // Get or create demo portfolio
    let { data: portfolios } = await supabase
      .from('portfolios')
      .select('*')
      .limit(1);

    if (!portfolios || portfolios.length === 0) {
      const { data: newPortfolio } = await supabase
        .from('portfolios')
        .insert({ cash_balance: 100000 })
        .select()
        .single();
      portfolios = newPortfolio ? [newPortfolio] : [];
    }

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
    }

    const portfolio = portfolios[0];

    // Get positions
    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolio.id);

    // Get portfolio snapshots (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: snapshots } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('timestamp', { ascending: true });

    // Enrich positions with current prices
    const enrichedPositions: Position[] = [];
    let positionsValue = 0;

    for (const pos of (positions ?? [])) {
      const quote = await getQuote(pos.symbol);
      const currentPrice = quote?.price ?? pos.avg_cost_basis;
      const unrealizedPnl = (currentPrice - pos.avg_cost_basis) * pos.shares;
      const unrealizedPnlPct = ((currentPrice - pos.avg_cost_basis) / pos.avg_cost_basis) * 100;

      positionsValue += currentPrice * pos.shares;
      enrichedPositions.push({
        ...pos,
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
      });
    }

    const totalValue = portfolio.cash_balance + positionsValue;

    // Compute today P&L from snapshots
    const yesterday = snapshots && snapshots.length > 1
      ? snapshots[snapshots.length - 2]?.total_value
      : null;
    const todayPnl = yesterday ? totalValue - yesterday : 0;
    const todayPnlPct = yesterday ? (todayPnl / yesterday) * 100 : 0;

    // All-time P&L (starting value 100k)
    const startValue = 100000;
    const totalPnl = totalValue - startValue;
    const totalPnlPct = (totalPnl / startValue) * 100;

    // Win rate from trades
    const { data: trades } = await supabase
      .from('trades')
      .select('action, total_value')
      .eq('portfolio_id', portfolio.id)
      .in('action', ['BUY', 'SELL']);

    const sellTrades = (trades ?? []).filter(t => t.action === 'SELL');
    const winRate = sellTrades.length > 0
      ? (sellTrades.filter(t => (t.total_value ?? 0) > 0).length / sellTrades.length) * 100
      : 0;

    const stats: PortfolioStats = {
      totalValue,
      cashBalance: portfolio.cash_balance,
      positionsValue,
      totalPnl,
      totalPnlPct,
      todayPnl,
      todayPnlPct,
      winRate,
      positions: enrichedPositions,
      snapshots: snapshots ?? [],
    };

    return NextResponse.json({ portfolio, stats });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json({ portfolio: null, stats: MOCK_STATS });
  }
}
