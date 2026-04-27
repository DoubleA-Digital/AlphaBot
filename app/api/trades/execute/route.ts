import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      portfolio_id,
      symbol,
      action,
      shares,
      price,
      reasoning,
      confidence,
      indicators_snapshot,
    } = body;

    if (!portfolio_id || !symbol || !action || !price) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const totalValue = shares * price;

    // Get portfolio
    const { data: portfolio, error: portError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolio_id)
      .single();

    if (portError || !portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    if (action === 'BUY') {
      // Validate sufficient cash
      if (portfolio.cash_balance < totalValue) {
        return NextResponse.json({ error: 'Insufficient cash balance' }, { status: 400 });
      }

      // Check max position size (20% rule)
      const { data: allPositions } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio_id);

      const positionsValue = (allPositions ?? []).reduce((sum: number, p: { shares: number; avg_cost_basis: number }) => sum + p.shares * p.avg_cost_basis, 0);
      const totalPortValue = portfolio.cash_balance + positionsValue;
      const maxPositionValue = totalPortValue * 0.20;

      if (totalValue > maxPositionValue) {
        return NextResponse.json({
          error: `Trade would exceed 20% position limit. Max: $${maxPositionValue.toFixed(2)}`,
        }, { status: 400 });
      }

      // Update or create position
      const { data: existingPos } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio_id)
        .eq('symbol', symbol)
        .single();

      if (existingPos) {
        const newShares = existingPos.shares + shares;
        const newAvgCost = (existingPos.shares * existingPos.avg_cost_basis + totalValue) / newShares;

        await supabase
          .from('positions')
          .update({ shares: newShares, avg_cost_basis: newAvgCost })
          .eq('id', existingPos.id);
      } else {
        await supabase
          .from('positions')
          .insert({ portfolio_id, symbol, shares, avg_cost_basis: price });
      }

      // Deduct cash
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance - totalValue, updated_at: new Date().toISOString() })
        .eq('id', portfolio_id);

    } else if (action === 'SELL') {
      const { data: existingPos } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio_id)
        .eq('symbol', symbol)
        .single();

      if (!existingPos || existingPos.shares < shares) {
        return NextResponse.json({ error: 'Insufficient shares for SELL' }, { status: 400 });
      }

      const remainingShares = existingPos.shares - shares;

      if (remainingShares <= 0.0001) {
        await supabase.from('positions').delete().eq('id', existingPos.id);
      } else {
        await supabase
          .from('positions')
          .update({ shares: remainingShares })
          .eq('id', existingPos.id);
      }

      // Add cash
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance + totalValue, updated_at: new Date().toISOString() })
        .eq('id', portfolio_id);
    }

    // Log trade
    const { data: trade } = await supabase
      .from('trades')
      .insert({
        portfolio_id,
        symbol,
        action,
        shares: action !== 'HOLD' ? shares : null,
        price,
        total_value: action !== 'HOLD' ? totalValue : null,
        reasoning,
        confidence,
        indicators_snapshot,
      })
      .select()
      .single();

    // Portfolio snapshot
    const { data: updatedPortfolio } = await supabase
      .from('portfolios')
      .select('cash_balance')
      .eq('id', portfolio_id)
      .single();

    const { data: positions } = await supabase
      .from('positions')
      .select('shares, avg_cost_basis')
      .eq('portfolio_id', portfolio_id);

    const posVal = (positions ?? []).reduce((s: number, p: { shares: number; avg_cost_basis: number }) => s + p.shares * p.avg_cost_basis, 0);
    const totalVal = (updatedPortfolio?.cash_balance ?? 0) + posVal;

    await supabase
      .from('portfolio_snapshots')
      .insert({ portfolio_id, total_value: totalVal });

    return NextResponse.json({ success: true, trade });
  } catch (error) {
    console.error('Trade execution error:', error);
    return NextResponse.json({ error: 'Trade execution failed' }, { status: 500 });
  }
}
