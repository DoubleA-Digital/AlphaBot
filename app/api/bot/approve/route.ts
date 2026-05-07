import { NextRequest, NextResponse } from 'next/server';

// Stateless — client sends current state, we validate & return result.
// Client persists everything to localStorage. No server memory needed.

interface Position {
  symbol: string;
  shares: number;
  avg_cost_basis: number;
}

interface ApproveBody {
  symbol: string;
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  reasoning?: string;
  confidence?: number;
  sell_target?: number;
  stop_loss?: number;
  currentCash: number;
  currentPositions: Position[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ApproveBody = await req.json();
    const {
      symbol, action, shares, price,
      reasoning = '', confidence = 0,
      sell_target = 0, stop_loss = 0,
      currentCash, currentPositions,
    } = body;

    if (!symbol || !action || !shares || !price || currentCash === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const totalCost = parseFloat((shares * price).toFixed(2));
    const positions: Position[] = currentPositions.map(p => ({ ...p }));
    const posValue = positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);
    const totalPortfolioValue = currentCash + posValue;
    let newCash = currentCash;

    if (action === 'BUY') {
      if (currentCash < totalCost) {
        return NextResponse.json({ error: `Insufficient cash. Need $${totalCost.toFixed(2)}, have $${currentCash.toFixed(2)}` }, { status: 400 });
      }
      if (totalCost > totalPortfolioValue * 0.25) {
        return NextResponse.json({ error: `Exceeds 25% position limit ($${(totalPortfolioValue * 0.25).toFixed(2)} max)` }, { status: 400 });
      }

      const existing = positions.find(p => p.symbol === symbol);
      if (existing) {
        const newShares = existing.shares + shares;
        existing.avg_cost_basis = parseFloat(((existing.shares * existing.avg_cost_basis + totalCost) / newShares).toFixed(4));
        existing.shares = parseFloat(newShares.toFixed(4));
      } else {
        positions.push({ symbol, shares, avg_cost_basis: price });
      }
      newCash = parseFloat((currentCash - totalCost).toFixed(2));

    } else if (action === 'SELL') {
      const idx = positions.findIndex(p => p.symbol === symbol);
      if (idx === -1 || positions[idx].shares < shares) {
        return NextResponse.json({ error: 'Insufficient shares to sell' }, { status: 400 });
      }
      positions[idx].shares = parseFloat((positions[idx].shares - shares).toFixed(4));
      if (positions[idx].shares < 0.0001) positions.splice(idx, 1);
      newCash = parseFloat((currentCash + totalCost).toFixed(2));
    }

    const newPosValue = positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);

    // If Supabase is configured, also persist there
    const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http');
    if (hasSupabase) {
      try {
        const { createAdminClient } = await import('@/lib/supabase');
        const supabase = createAdminClient();
        let { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);
        if (!portfolios?.length) {
          const { data: np } = await supabase.from('portfolios').insert({ cash_balance: 4000 }).select().single();
          portfolios = np ? [np] : [];
        }
        const portfolio = portfolios?.[0];
        if (portfolio) {
          await supabase.from('portfolios').update({ cash_balance: newCash, updated_at: new Date().toISOString() }).eq('id', portfolio.id);
          await supabase.from('trades').insert({ portfolio_id: portfolio.id, symbol, action, shares, price, total_value: totalCost, reasoning, confidence });
          // Upsert positions
          await supabase.from('positions').delete().eq('portfolio_id', portfolio.id);
          if (positions.length > 0) {
            await supabase.from('positions').insert(positions.map(p => ({ portfolio_id: portfolio.id, symbol: p.symbol, shares: p.shares, avg_cost_basis: p.avg_cost_basis })));
          }
          await supabase.from('portfolio_snapshots').insert({ portfolio_id: portfolio.id, total_value: newCash + newPosValue });
        }
      } catch (e) {
        console.error('Supabase persist error (non-fatal):', e);
      }
    }

    return NextResponse.json({
      success: true,
      trade: { symbol, action, shares, price, totalCost, sell_target, stop_loss, reasoning, confidence },
      newState: {
        cash: newCash,
        positions,
        totalValue: parseFloat((newCash + newPosValue).toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Approve error:', error);
    return NextResponse.json({ error: 'Trade execution failed' }, { status: 500 });
  }
}
