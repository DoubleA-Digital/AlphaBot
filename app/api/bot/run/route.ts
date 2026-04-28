import { NextRequest, NextResponse } from 'next/server';
import { getQuote, getHistory } from '@/lib/market';
import { generateMockQuote, generateMockHistory } from '@/lib/mockData';
import { DEFAULT_WATCHLIST } from '@/lib/constants';
import { computeIndicators } from '@/lib/indicators';
import { analyzeStock } from '@/lib/claude';
import type { BotDecisionLog } from '@/types';

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

// In-memory paper portfolio (used when Supabase is not configured)
let memPortfolio = { cash_balance: 100000 };
type MemPosition = { symbol: string; shares: number; avg_cost_basis: number };
const memPositions: MemPosition[] = [];

function executeMemTrade(
  symbol: string,
  action: 'BUY' | 'SELL' | 'HOLD',
  shares: number,
  price: number,
  totalPortfolioValue: number
): { ok: boolean; error?: string } {
  const totalValue = shares * price;
  if (action === 'BUY') {
    if (memPortfolio.cash_balance < totalValue) return { ok: false, error: 'Insufficient cash' };
    if (totalValue > totalPortfolioValue * 0.20) return { ok: false, error: 'Exceeds 20% position limit' };
    const existing = memPositions.find(p => p.symbol === symbol);
    if (existing) {
      const newShares = existing.shares + shares;
      existing.avg_cost_basis = (existing.shares * existing.avg_cost_basis + totalValue) / newShares;
      existing.shares = newShares;
    } else {
      memPositions.push({ symbol, shares, avg_cost_basis: price });
    }
    memPortfolio.cash_balance -= totalValue;
  } else if (action === 'SELL') {
    const idx = memPositions.findIndex(p => p.symbol === symbol);
    if (idx === -1 || memPositions[idx].shares < shares) return { ok: false, error: 'Insufficient shares' };
    memPositions[idx].shares -= shares;
    if (memPositions[idx].shares < 0.0001) memPositions.splice(idx, 1);
    memPortfolio.cash_balance += totalValue;
  }
  return { ok: true };
}

async function runWithSupabase(watchlist: string[]): Promise<{ decisionLog: BotDecisionLog[]; decisionsCount: number }> {
  const { createAdminClient } = await import('@/lib/supabase');
  const supabase = createAdminClient();

  let { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);
  if (!portfolios || portfolios.length === 0) {
    const { data: np } = await supabase.from('portfolios').insert({ cash_balance: 100000 }).select().single();
    portfolios = np ? [np] : [];
  }
  if (!portfolios || portfolios.length === 0) throw new Error('Could not create portfolio');

  const portfolio = portfolios[0];
  const decisionLog: BotDecisionLog[] = [];
  let decisionsCount = 0;

  for (const symbol of watchlist.slice(0, 5)) {
    try {
      let [quote, history] = await Promise.all([getQuote(symbol), getHistory(symbol, 90)]);
      if (!quote) quote = generateMockQuote(symbol);
      if (!history || history.length < 5) history = generateMockHistory(symbol, 90);

      const fullHistory = [...history, { date: new Date().toISOString().split('T')[0], open: quote.open, high: quote.high, low: quote.low, close: quote.price, volume: quote.volume }];
      const indicators = computeIndicators(symbol, fullHistory);

      const [pr, posr] = await Promise.all([
        supabase.from('portfolios').select('cash_balance').eq('id', portfolio.id).single(),
        supabase.from('positions').select('*').eq('portfolio_id', portfolio.id),
      ]);
      const currentCash = pr.data?.cash_balance ?? portfolio.cash_balance;
      const positions = posr.data ?? [];
      const posVal = positions.reduce((s: number, p: { shares: number; avg_cost_basis: number }) => s + p.shares * p.avg_cost_basis, 0);
      const totalValue = currentCash + posVal;

      const decision = await analyzeStock(indicators, { ...portfolio, cash_balance: currentCash }, positions, totalValue);
      let executed = false;
      let execError: string | undefined;

      if ((decision.action === 'BUY' || decision.action === 'SELL') && decision.shares > 0) {
        const tv = decision.shares * indicators.price;
        if (decision.action === 'BUY') {
          if (currentCash >= tv && tv <= totalValue * 0.20) {
            const { data: ep } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id).eq('symbol', symbol).single();
            if (ep) {
              const ns = ep.shares + decision.shares;
              await supabase.from('positions').update({ shares: ns, avg_cost_basis: (ep.shares * ep.avg_cost_basis + tv) / ns }).eq('id', ep.id);
            } else {
              await supabase.from('positions').insert({ portfolio_id: portfolio.id, symbol, shares: decision.shares, avg_cost_basis: indicators.price });
            }
            await supabase.from('portfolios').update({ cash_balance: currentCash - tv, updated_at: new Date().toISOString() }).eq('id', portfolio.id);
            executed = true; decisionsCount++;
          } else { execError = tv > totalValue * 0.20 ? 'Exceeds 20% position limit' : 'Insufficient cash'; }
        } else {
          const { data: ep } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id).eq('symbol', symbol).single();
          if (ep && ep.shares >= decision.shares) {
            const rem = ep.shares - decision.shares;
            if (rem < 0.0001) await supabase.from('positions').delete().eq('id', ep.id);
            else await supabase.from('positions').update({ shares: rem }).eq('id', ep.id);
            await supabase.from('portfolios').update({ cash_balance: currentCash + tv, updated_at: new Date().toISOString() }).eq('id', portfolio.id);
            executed = true; decisionsCount++;
          } else { execError = 'Insufficient shares'; }
        }
        await supabase.from('trades').insert({ portfolio_id: portfolio.id, symbol, action: decision.action, shares: decision.shares, price: indicators.price, total_value: tv, reasoning: decision.reasoning, confidence: decision.confidence, indicators_snapshot: { rsi14: indicators.rsi14, macd: indicators.macd } });
      } else {
        await supabase.from('trades').insert({ portfolio_id: portfolio.id, symbol, action: 'HOLD', price: indicators.price, reasoning: decision.reasoning, confidence: decision.confidence, indicators_snapshot: { rsi14: indicators.rsi14 } });
        executed = true; decisionsCount++;
      }

      decisionLog.push({ symbol, decision, indicators, executed, error: execError, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error(`Error processing ${symbol}:`, err);
    }
  }

  const { data: fp } = await supabase.from('portfolios').select('cash_balance').eq('id', portfolio.id).single();
  const { data: fpos } = await supabase.from('positions').select('shares, avg_cost_basis').eq('portfolio_id', portfolio.id);
  const fpv = (fpos ?? []).reduce((s: number, p: { shares: number; avg_cost_basis: number }) => s + p.shares * p.avg_cost_basis, 0);
  await supabase.from('portfolio_snapshots').insert({ portfolio_id: portfolio.id, total_value: (fp?.cash_balance ?? 100000) + fpv });

  return { decisionLog, decisionsCount };
}

async function runInMemory(watchlist: string[]): Promise<{ decisionLog: BotDecisionLog[]; decisionsCount: number }> {
  const decisionLog: BotDecisionLog[] = [];
  let decisionsCount = 0;

  for (const symbol of watchlist.slice(0, 5)) {
    try {
      let [quote, history] = await Promise.all([getQuote(symbol), getHistory(symbol, 90)]);
      if (!quote) quote = generateMockQuote(symbol);
      if (!history || history.length < 5) history = generateMockHistory(symbol, 90);

      const fullHistory = [...history, { date: new Date().toISOString().split('T')[0], open: quote.open, high: quote.high, low: quote.low, close: quote.price, volume: quote.volume }];
      const indicators = computeIndicators(symbol, fullHistory);

      const posVal = memPositions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);
      const totalValue = memPortfolio.cash_balance + posVal;

      const decision = await analyzeStock(
        indicators,
        { id: 'mem', user_id: 'mem', cash_balance: memPortfolio.cash_balance, created_at: '', updated_at: '' },
        memPositions.map(p => ({ id: p.symbol, portfolio_id: 'mem', symbol: p.symbol, shares: p.shares, avg_cost_basis: p.avg_cost_basis, created_at: '' })),
        totalValue
      );

      let executed = false;
      let execError: string | undefined;

      if ((decision.action === 'BUY' || decision.action === 'SELL') && decision.shares > 0) {
        const result = executeMemTrade(symbol, decision.action, decision.shares, indicators.price, totalValue);
        executed = result.ok;
        execError = result.error;
        if (executed) decisionsCount++;
      } else {
        executed = true;
        decisionsCount++;
      }

      decisionLog.push({ symbol, decision, indicators, executed, error: execError, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error(`Error processing ${symbol}:`, err);
    }
  }

  return { decisionLog, decisionsCount };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawWatchlist: string[] = body.watchlist ?? DEFAULT_WATCHLIST;
    const watchlist = rawWatchlist.filter(s => /^[A-Z]{1,10}$/.test(s)).slice(0, 20);

    const { decisionLog, decisionsCount } = hasSupabase
      ? await runWithSupabase(watchlist)
      : await runInMemory(watchlist);

    return NextResponse.json({ success: true, decisionsCount, decisionLog, mode: hasSupabase ? 'live' : 'demo' });
  } catch (error) {
    console.error('Bot run error:', error);
    return NextResponse.json({ error: 'Bot run failed', details: String(error) }, { status: 500 });
  }
}
