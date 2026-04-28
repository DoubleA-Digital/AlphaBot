import { NextRequest, NextResponse } from 'next/server';
import { memPortfolioState, memPositions } from '../run/route';

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

interface ApproveBody {
  symbol: string;
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  reasoning?: string;
  confidence?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: ApproveBody = await req.json();
    const { symbol, action, shares, price, reasoning, confidence } = body;

    if (!symbol || !action || !shares || !price) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const totalCost = shares * price;

    if (hasSupabase) {
      const { createAdminClient } = await import('@/lib/supabase');
      const supabase = createAdminClient();

      let { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);
      if (!portfolios || portfolios.length === 0) {
        const { data: np } = await supabase.from('portfolios').insert({ cash_balance: 4000 }).select().single();
        portfolios = np ? [np] : [];
      }
      const portfolio = portfolios?.[0];
      if (!portfolio) return NextResponse.json({ error: 'No portfolio found' }, { status: 500 });

      const cash = portfolio.cash_balance as number;
      const posVal = 0;
      const totalValue = cash + posVal;

      if (action === 'BUY') {
        if (cash < totalCost) return NextResponse.json({ error: 'Insufficient cash' }, { status: 400 });
        if (totalCost > totalValue * 0.25) return NextResponse.json({ error: 'Exceeds 25% position limit' }, { status: 400 });

        const { data: existing } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id).eq('symbol', symbol).single();
        if (existing) {
          const newShares = existing.shares + shares;
          const newAvg = (existing.shares * existing.avg_cost_basis + totalCost) / newShares;
          await supabase.from('positions').update({ shares: newShares, avg_cost_basis: newAvg }).eq('id', existing.id);
        } else {
          await supabase.from('positions').insert({ portfolio_id: portfolio.id, symbol, shares, avg_cost_basis: price });
        }
        await supabase.from('portfolios').update({ cash_balance: cash - totalCost, updated_at: new Date().toISOString() }).eq('id', portfolio.id);
        await supabase.from('trades').insert({ portfolio_id: portfolio.id, symbol, action, shares, price, total_value: totalCost, reasoning, confidence });
      } else if (action === 'SELL') {
        const { data: existing } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id).eq('symbol', symbol).single();
        if (!existing || existing.shares < shares) return NextResponse.json({ error: 'Insufficient shares' }, { status: 400 });

        const remaining = existing.shares - shares;
        if (remaining < 0.0001) {
          await supabase.from('positions').delete().eq('id', existing.id);
        } else {
          await supabase.from('positions').update({ shares: remaining }).eq('id', existing.id);
        }
        await supabase.from('portfolios').update({ cash_balance: cash + totalCost, updated_at: new Date().toISOString() }).eq('id', portfolio.id);
        await supabase.from('trades').insert({ portfolio_id: portfolio.id, symbol, action, shares, price, total_value: totalCost, reasoning, confidence });
      }

      const { data: updatedPortfolio } = await supabase.from('portfolios').select('cash_balance').eq('id', portfolio.id).single();
      const { data: updatedPositions } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id);
      const updatedPosVal = (updatedPositions ?? []).reduce((s: number, p: { shares: number; avg_cost_basis: number }) => s + p.shares * p.avg_cost_basis, 0);

      return NextResponse.json({
        success: true,
        trade: { symbol, action, shares, price, totalCost },
        portfolioState: {
          cash: updatedPortfolio?.cash_balance ?? 0,
          positions: updatedPositions ?? [],
          totalValue: (updatedPortfolio?.cash_balance ?? 0) + updatedPosVal,
        },
      });
    }

    // In-memory path
    const currentCash = memPortfolioState.cash;
    const currentPositions = memPositions;
    const positionsValue = currentPositions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);
    const totalValue = currentCash + positionsValue;

    if (action === 'BUY') {
      if (currentCash < totalCost) return NextResponse.json({ error: 'Insufficient cash' }, { status: 400 });
      if (totalCost > totalValue * 0.25) return NextResponse.json({ error: 'Exceeds 25% position limit' }, { status: 400 });

      const existing = currentPositions.find(p => p.symbol === symbol);
      if (existing) {
        const newShares = existing.shares + shares;
        existing.avg_cost_basis = (existing.shares * existing.avg_cost_basis + totalCost) / newShares;
        existing.shares = newShares;
      } else {
        currentPositions.push({ symbol, shares, avg_cost_basis: price });
      }
      memPortfolioState.cash = currentCash - totalCost;
    } else if (action === 'SELL') {
      const idx = currentPositions.findIndex(p => p.symbol === symbol);
      if (idx === -1 || currentPositions[idx].shares < shares) {
        return NextResponse.json({ error: 'Insufficient shares' }, { status: 400 });
      }
      currentPositions[idx].shares -= shares;
      if (currentPositions[idx].shares < 0.0001) currentPositions.splice(idx, 1);
      memPortfolioState.cash = currentCash + totalCost;
    }

    const newCash = memPortfolioState.cash;
    const newPosVal = currentPositions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);

    return NextResponse.json({
      success: true,
      trade: { symbol, action, shares, price, totalCost },
      portfolioState: {
        cash: newCash,
        positions: currentPositions,
        totalValue: newCash + newPosVal,
      },
    });
  } catch (error) {
    console.error('Approve trade error:', error);
    return NextResponse.json({ error: 'Trade execution failed', details: String(error) }, { status: 500 });
  }
}
