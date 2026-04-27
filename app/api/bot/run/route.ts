import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getQuote, getHistory } from '@/lib/market';
import { DEFAULT_WATCHLIST } from '@/lib/constants';
import { computeIndicators } from '@/lib/indicators';
import { analyzeStock } from '@/lib/claude';
import type { BotDecisionLog } from '@/types';

// Validate symbol: only uppercase letters, 1-6 chars
function isValidSymbol(s: string): boolean {
  return /^[A-Z]{1,6}$/.test(s);
}

// Execute a trade directly via Supabase (no self-fetch)
async function executeTrade(
  supabase: ReturnType<typeof createAdminClient>,
  portfolioId: string,
  portfolioCash: number,
  symbol: string,
  action: 'BUY' | 'SELL' | 'HOLD',
  shares: number,
  price: number,
  reasoning: string,
  confidence: number,
  indicatorsSnapshot: Record<string, unknown>,
  totalPortfolioValue: number
): Promise<{ ok: boolean; error?: string }> {
  const totalValue = shares * price;

  if (action === 'BUY') {
    if (portfolioCash < totalValue) return { ok: false, error: 'Insufficient cash' };
    if (totalValue > totalPortfolioValue * 0.20) return { ok: false, error: 'Exceeds 20% position limit' };

    const { data: existingPos } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('symbol', symbol)
      .single();

    if (existingPos) {
      const newShares = existingPos.shares + shares;
      const newAvgCost = (existingPos.shares * existingPos.avg_cost_basis + totalValue) / newShares;
      await supabase.from('positions').update({ shares: newShares, avg_cost_basis: newAvgCost }).eq('id', existingPos.id);
    } else {
      await supabase.from('positions').insert({ portfolio_id: portfolioId, symbol, shares, avg_cost_basis: price });
    }

    await supabase.from('portfolios').update({
      cash_balance: portfolioCash - totalValue,
      updated_at: new Date().toISOString(),
    }).eq('id', portfolioId);

  } else if (action === 'SELL') {
    const { data: existingPos } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('symbol', symbol)
      .single();

    if (!existingPos || existingPos.shares < shares) return { ok: false, error: 'Insufficient shares' };

    const remaining = existingPos.shares - shares;
    if (remaining <= 0.0001) {
      await supabase.from('positions').delete().eq('id', existingPos.id);
    } else {
      await supabase.from('positions').update({ shares: remaining }).eq('id', existingPos.id);
    }

    await supabase.from('portfolios').update({
      cash_balance: portfolioCash + totalValue,
      updated_at: new Date().toISOString(),
    }).eq('id', portfolioId);
  }

  // Log trade
  await supabase.from('trades').insert({
    portfolio_id: portfolioId,
    symbol,
    action,
    shares: action !== 'HOLD' ? shares : null,
    price,
    total_value: action !== 'HOLD' ? totalValue : null,
    reasoning,
    confidence,
    indicators_snapshot: indicatorsSnapshot,
  });

  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawWatchlist: string[] = body.watchlist ?? DEFAULT_WATCHLIST;
    // Sanitize watchlist symbols
    const watchlist = rawWatchlist.filter(isValidSymbol).slice(0, 20);

    const supabase = createAdminClient();

    // Get or create portfolio
    let { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);

    if (!portfolios || portfolios.length === 0) {
      const { data: newPortfolio } = await supabase
        .from('portfolios').insert({ cash_balance: 100000 }).select().single();
      portfolios = newPortfolio ? [newPortfolio] : [];
    }

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ error: 'No portfolio found' }, { status: 500 });
    }

    const portfolio = portfolios[0];

    // Create bot run record
    const { data: botRun } = await supabase
      .from('bot_runs')
      .insert({ portfolio_id: portfolio.id, status: 'running' })
      .select()
      .single();

    const decisionLog: BotDecisionLog[] = [];
    let decisionsCount = 0;

    // Process up to 5 stocks per run (rate limit consideration)
    const batch = watchlist.slice(0, 5);

    for (const symbol of batch) {
      try {
        const [quoteResult, historyResult] = await Promise.allSettled([
          getQuote(symbol),
          getHistory(symbol, 90),
        ]);

        const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
        const history = historyResult.status === 'fulfilled' ? historyResult.value : [];

        if (!quote) {
          console.log(`No quote for ${symbol}, skipping`);
          continue;
        }

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

        // Refresh portfolio state for each decision
        const [portfolioRefresh, positionsRefresh] = await Promise.all([
          supabase.from('portfolios').select('cash_balance').eq('id', portfolio.id).single(),
          supabase.from('positions').select('*').eq('portfolio_id', portfolio.id),
        ]);

        const currentCash = portfolioRefresh.data?.cash_balance ?? portfolio.cash_balance;
        const positions = positionsRefresh.data ?? [];
        const positionsValue = positions.reduce(
          (sum: number, p: { shares: number; avg_cost_basis: number }) => sum + p.shares * p.avg_cost_basis,
          0
        );
        const totalPortfolioValue = currentCash + positionsValue;

        const decision = await analyzeStock(
          indicators,
          { ...portfolio, cash_balance: currentCash },
          positions,
          totalPortfolioValue
        );

        let executed = false;
        let execError: string | undefined;

        if ((decision.action === 'BUY' || decision.action === 'SELL') && decision.shares > 0) {
          const result = await executeTrade(
            supabase,
            portfolio.id,
            currentCash,
            symbol,
            decision.action,
            decision.shares,
            indicators.price,
            decision.reasoning,
            decision.confidence,
            { rsi14: indicators.rsi14, macd: indicators.macd, sma20: indicators.sma20, sma50: indicators.sma50 },
            totalPortfolioValue
          );
          executed = result.ok;
          execError = result.error;
          if (executed) decisionsCount++;
        } else if (decision.action === 'HOLD') {
          await supabase.from('trades').insert({
            portfolio_id: portfolio.id,
            symbol,
            action: 'HOLD',
            price: indicators.price,
            reasoning: decision.reasoning,
            confidence: decision.confidence,
            indicators_snapshot: { rsi14: indicators.rsi14 },
          });
          executed = true;
          decisionsCount++;
        }

        decisionLog.push({
          symbol,
          decision,
          indicators,
          executed,
          error: execError,
          timestamp: new Date().toISOString(),
        });

      } catch (err) {
        console.error(`Error processing ${symbol}:`, err);
        decisionLog.push({
          symbol,
          decision: {
            action: 'HOLD',
            symbol,
            shares: 0,
            reasoning: 'Error during analysis',
            confidence: 0,
            risk_score: 1,
            price_target: 0,
            stop_loss: 0,
            market_regime: 'ranging',
            key_signals: [],
          },
          indicators: computeIndicators(symbol, []),
          executed: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Take final portfolio snapshot
    const { data: finalPortfolio } = await supabase.from('portfolios').select('cash_balance').eq('id', portfolio.id).single();
    const { data: finalPositions } = await supabase.from('positions').select('shares, avg_cost_basis').eq('portfolio_id', portfolio.id);
    const finalPosVal = (finalPositions ?? []).reduce((s: number, p: { shares: number; avg_cost_basis: number }) => s + p.shares * p.avg_cost_basis, 0);
    await supabase.from('portfolio_snapshots').insert({
      portfolio_id: portfolio.id,
      total_value: (finalPortfolio?.cash_balance ?? portfolio.cash_balance) + finalPosVal,
    });

    // Complete bot run
    if (botRun) {
      await supabase.from('bot_runs').update({
        completed_at: new Date().toISOString(),
        decisions_made: decisionsCount,
        status: 'completed',
      }).eq('id', botRun.id);
    }

    return NextResponse.json({ success: true, decisionsCount, decisionLog, botRunId: botRun?.id });
  } catch (error) {
    console.error('Bot run error:', error);
    return NextResponse.json({ error: 'Bot run failed', details: String(error) }, { status: 500 });
  }
}
