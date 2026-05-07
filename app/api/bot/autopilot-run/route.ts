import { NextResponse } from 'next/server';
import { getQuote, getHistory } from '@/lib/market';
import { generateMockQuote, generateMockHistory } from '@/lib/mockData';
import { computeIndicators } from '@/lib/indicators';
import { getAutopilotSettings, saveAutopilotSettings, isMarketOpen, getMarketSession, logActivity, createAlert } from '@/lib/autopilot';
import type { ClaudeRecommendation } from '@/types';

const WATCHLIST = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','JPM','BAC','SPY','QQQ','PLTR','SOFI','CRWD','PYPL','NFLX','DIS','RIVN','ROKU'];

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

const SENIOR_TRADER_SYSTEM_PROMPT = `You are AlphaBot — an autonomous AI with the decision-making instincts of a senior day trader with 25 years of experience on Wall Street. You manage a $4,000 live paper trading portfolio for a group of young investors trying to maximize returns over 30 days.

YOUR TRADING PHILOSOPHY:
- Capital preservation is priority #1. Never let a single bad trade wipe out more than 5% of the portfolio ($200 max loss per trade)
- You think in risk/reward ratios. You never take a trade unless the reward is at least 2x the risk
- You read momentum like a hawk. You enter when a move is STARTING, not when it is already extended
- You are never emotionally attached to a position. If the thesis breaks, you exit immediately, no hesitation
- You understand that cash is a position. Sometimes doing nothing IS the trade
- You know the difference between a dip to buy and a trend reversal to exit
- You think about WHEN to be in a trade — morning momentum, midday chop, afternoon trend continuation
- You size positions based on conviction: high conviction = larger size, uncertain = smaller size or skip
- You never chase. If you missed the entry, you wait for the next setup
- You always define your exit BEFORE you enter

DECISION RULES YOU FOLLOW:
1. ENTRY RULES — You only buy when at least 4 of these 6 conditions are true:
   - RSI between 35-55 (not overbought, not deeply oversold — you want momentum starting, not exhausted)
   - MACD histogram turning positive (momentum shifting bullish)
   - Price above 20-day SMA (trend is up)
   - Volume at least 1.3x the 20-day average (institutional interest)
   - Positive news sentiment in last 48 hours
   - Price within 3% of a key support level or breaking out of consolidation

2. EXIT RULES — You exit a position immediately when ANY of these trigger:
   - Price hits the predetermined stop loss (non-negotiable, always honored)
   - Price hits the take-profit target (you take the win, you do not get greedy)
   - RSI crosses above 75 (overbought — smart money is selling, you sell too)
   - MACD histogram turns negative after a profitable run (momentum dying)
   - A major negative news event drops for a stock you hold
   - The position has been held for more than 5 trading days without hitting target (time stop — dead money exits)

3. POSITION SIZING RULES:
   - Maximum 25% of portfolio in one stock ($1,000)
   - High conviction trade (confidence > 0.85): 20-25% of portfolio
   - Medium conviction (0.70-0.84): 10-15% of portfolio
   - Low conviction (< 0.70): Skip or 5-8% max, only if setup is very clean
   - Always keep minimum 20% cash reserve ($800) — never go fully invested

4. TIME OF DAY AWARENESS:
   - 9:30-10:00am ET (Market Open): High volatility, wide spreads — only enter the cleanest setups
   - 10:00-11:30am ET (Morning Trend): Best time to enter momentum trades
   - 11:30am-1:00pm ET (Midday Chop): Avoid new entries, manage existing positions only
   - 1:00-2:30pm ET (Afternoon Setup): Look for afternoon trend setups forming
   - 2:30-3:45pm ET (Power Hour): Strong directional moves, good for entries AND exits
   - 3:45-4:00pm ET (Close): Exit intraday positions, let swing trades run overnight only if thesis intact

You must account for the current time of day when making decisions and adjust your aggression accordingly.

OUTPUT FORMAT: Always respond in valid JSON only. No preamble, no explanation outside the JSON structure.

Return this exact JSON structure:
{
  "market_summary": "string — senior trader's read of the market",
  "market_session": "string — current session assessment",
  "defensive_mode_recommended": false,
  "defensive_mode_reason": null,
  "recommendations": [
    {
      "action": "BUY",
      "symbol": "NVDA",
      "shares": 4,
      "buy_at_price": 131.20,
      "sell_target_price": 142.80,
      "stop_loss_price": 124.00,
      "confidence": 0.88,
      "risk_level": "MEDIUM",
      "reasoning": "string",
      "key_signals": ["MACD crossover", "volume surge 1.8x avg", "RSI 48 — momentum starting"],
      "expected_timeframe": "2-5 days",
      "estimated_profit": "$46.40",
      "estimated_loss": "$28.80",
      "conditions_met": 5,
      "conditions_total": 6
    }
  ],
  "do_not_touch": ["TSLA"],
  "do_not_touch_reasons": ["TSLA: RSI overbought at 74, momentum exhausted"],
  "skipped_symbols": [
    { "symbol": "AAPL", "reason": "No volume confirmation — waiting for cleaner entry" }
  ],
  "portfolio_health_score": 85,
  "monthly_return_projection": "10-16%",
  "plan_for_tomorrow": "string — what setups to watch tomorrow"
}`;

interface StockResearch {
  symbol: string;
  price: number;
  indicators: ReturnType<typeof computeIndicators> & { momentum5d?: number; momentum20d?: number };
  news: Array<{ headline: string; sentiment: string }>;
  insufficientData: boolean;
}

const newsCache = new Map<string, { headlines: Array<{ headline: string; sentiment: string }>; ts: number }>();

async function fetchNews(symbol: string): Promise<Array<{ headline: string; sentiment: string }>> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];
  const cached = newsCache.get(symbol);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.headlines;
  try {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${key}&limit=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.feed) return [];
    const headlines = data.feed.slice(0, 3).map((item: { title: string; overall_sentiment_label: string }) => ({
      headline: item.title,
      sentiment: item.overall_sentiment_label ?? 'Neutral',
    }));
    newsCache.set(symbol, { headlines, ts: Date.now() });
    return headlines;
  } catch { return []; }
}

async function researchStock(symbol: string): Promise<StockResearch> {
  let [quote, history] = await Promise.all([getQuote(symbol), getHistory(symbol, 90)]);
  if (!quote) quote = generateMockQuote(symbol);
  if (!history || history.length < 5) history = generateMockHistory(symbol, 90);
  const fullHistory = [
    ...history,
    { date: new Date().toISOString().split('T')[0], open: quote.open, high: quote.high, low: quote.low, close: quote.price, volume: quote.volume },
  ];
  const insufficientData = fullHistory.length < 50;
  const indicators = computeIndicators(symbol, fullHistory) as StockResearch['indicators'];
  if (!insufficientData) {
    const closes = fullHistory.map(b => b.close);
    const last = closes.length - 1;
    if (last >= 5) indicators.momentum5d = ((closes[last] - closes[last - 5]) / closes[last - 5]) * 100;
    if (last >= 20) indicators.momentum20d = ((closes[last] - closes[last - 20]) / closes[last - 20]) * 100;
  }
  const news = await fetchNews(symbol);
  return { symbol, price: quote.price, indicators, news, insufficientData };
}

interface SupabasePortfolio {
  id: string;
  cash_balance: number;
}
interface SupabasePosition {
  id: string;
  symbol: string;
  shares: number;
  avg_cost_basis: number;
  bought_at?: string;
  sell_target?: number;
  stop_loss?: number;
}

async function getSupabasePortfolio(): Promise<{ portfolio: SupabasePortfolio; positions: SupabasePosition[] } | null> {
  if (!hasSupabase) return null;
  try {
    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();
    let { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);
    if (!portfolios || portfolios.length === 0) {
      const { data: np } = await supabase.from('portfolios').insert({ cash_balance: 4000 }).select().single();
      portfolios = np ? [np] : [];
    }
    const portfolio = portfolios?.[0] as SupabasePortfolio;
    if (!portfolio) return null;
    const { data: positions } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id);
    return { portfolio, positions: (positions ?? []) as SupabasePosition[] };
  } catch { return null; }
}

interface ClaudeAutopilotResponse {
  market_summary: string;
  market_session: string;
  defensive_mode_recommended: boolean;
  defensive_mode_reason: string | null;
  recommendations: ClaudeRecommendation[];
  do_not_touch: string[];
  do_not_touch_reasons: string[];
  skipped_symbols: Array<{ symbol: string; reason: string }>;
  portfolio_health_score: number;
  monthly_return_projection: string;
  plan_for_tomorrow: string;
}

async function callSeniorTraderClaude(
  research: StockResearch[],
  cash: number,
  positions: SupabasePosition[],
  session: string,
  today: string
): Promise<ClaudeAutopilotResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const portfolioSection = JSON.stringify({
    cash_balance: cash,
    cash_reserve_minimum: 800,
    positions: positions.map(p => ({
      symbol: p.symbol,
      shares: p.shares,
      avg_cost: p.avg_cost_basis,
      sell_target: p.sell_target ?? null,
      stop_loss: p.stop_loss ?? null,
      current_value: p.shares * (research.find(r => r.symbol === p.symbol)?.price ?? p.avg_cost_basis),
    })),
    total_value: cash + positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0),
  }, null, 2);

  const stocksSection = research.map(r => {
    if (r.insufficientData) return `${r.symbol}: Insufficient data`;
    const ind = r.indicators;
    return `${r.symbol} ($${r.price.toFixed(2)}):
  RSI14=${ind.rsi14?.toFixed(1) ?? 'N/A'}, MACD=${ind.macd?.macd.toFixed(3) ?? 'N/A'} (hist=${ind.macd?.histogram.toFixed(3) ?? 'N/A'})
  SMA20=${ind.sma20?.toFixed(2) ?? 'N/A'}, Price vs SMA20=${ind.sma20 ? ((r.price / ind.sma20 - 1) * 100).toFixed(1) + '%' : 'N/A'}
  VolumeRatio=${ind.volumeRatio?.toFixed(2) ?? 'N/A'}x
  Momentum5d=${ind.momentum5d?.toFixed(2) ?? 'N/A'}%, Momentum20d=${ind.momentum20d?.toFixed(2) ?? 'N/A'}%
  News: ${r.news.length > 0 ? r.news.map(n => `"${n.headline}" [${n.sentiment}]`).join(' | ') : 'None'}`;
  }).join('\n\n');

  const userMessage = `Today: ${today} | Market Session: ${session} (account for time of day in all decisions)

PORTFOLIO STATE:
${portfolioSection}

STOCK RESEARCH DATA (all 20 watchlist stocks):
${stocksSection}

You are operating in AUTOPILOT MODE — you have full authority to execute trades. Analyze all stocks with the eyes of a 25-year Wall Street veteran. Identify 0-3 high-conviction setups. If market conditions are poor or it's midday chop, it is perfectly fine to recommend ZERO trades and preserve cash. Output ONLY valid JSON.`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: SENIOR_TRADER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage + '\n\nCRITICAL: Output ONLY the JSON object. Start with { and end with }' }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]) as ClaudeAutopilotResponse;
}

async function executeTradeInSupabase(
  portfolioId: string,
  position: SupabasePosition | undefined,
  rec: ClaudeRecommendation,
  currentCash: number
): Promise<{ success: boolean; error?: string }> {
  if (!hasSupabase) return { success: false, error: 'Supabase not configured' };
  const { createAdminClient } = await import('@/lib/supabase');
  const supabase = createAdminClient();

  if (rec.action === 'BUY') {
    const totalCost = rec.shares * rec.buy_at_price;
    if (currentCash < totalCost) return { success: false, error: 'Insufficient cash' };

    // Update/create position
    if (position) {
      const newShares = position.shares + rec.shares;
      const newAvg = (position.shares * position.avg_cost_basis + totalCost) / newShares;
      await supabase.from('positions').update({ shares: newShares, avg_cost_basis: newAvg }).eq('id', position.id);
    } else {
      await supabase.from('positions').insert({
        portfolio_id: portfolioId,
        symbol: rec.symbol,
        shares: rec.shares,
        avg_cost_basis: rec.buy_at_price,
        sell_target: rec.sell_target_price,
        stop_loss: rec.stop_loss_price,
        bought_at: new Date().toISOString(),
      });
    }

    await supabase.from('portfolios').update({ cash_balance: currentCash - totalCost }).eq('id', portfolioId);
    await supabase.from('trades').insert({
      portfolio_id: portfolioId,
      symbol: rec.symbol,
      action: 'BUY',
      shares: rec.shares,
      price: rec.buy_at_price,
      total_value: totalCost,
      reasoning: rec.reasoning,
      confidence: rec.confidence,
    });
    return { success: true };
  }

  if (rec.action === 'SELL' && position) {
    const proceeds = rec.shares * rec.buy_at_price;
    const remaining = position.shares - rec.shares;
    if (remaining <= 0.001) {
      await supabase.from('positions').delete().eq('id', position.id);
    } else {
      await supabase.from('positions').update({ shares: remaining }).eq('id', position.id);
    }
    await supabase.from('portfolios').update({ cash_balance: currentCash + proceeds }).eq('id', portfolioId);
    await supabase.from('trades').insert({
      portfolio_id: portfolioId,
      symbol: rec.symbol,
      action: 'SELL',
      shares: rec.shares,
      price: rec.buy_at_price,
      total_value: proceeds,
      reasoning: rec.reasoning,
      confidence: rec.confidence,
    });
    return { success: true };
  }

  return { success: false, error: 'Cannot execute trade' };
}

// Also accept POST for manual triggers from the UI
export async function GET() { return runAutopilot(); }
export async function POST() { return runAutopilot(); }

async function runAutopilot() {
  try {
    const autopilot = await getAutopilotSettings();
    if (!autopilot.isEnabled) {
      return NextResponse.json({ skipped: true, reason: 'Autopilot is disabled' });
    }

    const session = getMarketSession();
    if (!isMarketOpen()) {
      return NextResponse.json({ skipped: true, reason: `Market is closed (session: ${session})` });
    }

    // Skip midday chop for new entries
    if (session === 'midday-chop') {
      return NextResponse.json({ skipped: true, reason: 'Midday chop — no new entries, managing existing positions only' });
    }

    const dbState = await getSupabasePortfolio();
    if (!dbState) {
      return NextResponse.json({ skipped: true, reason: 'No Supabase portfolio found — autopilot requires Supabase' });
    }

    const { portfolio, positions } = dbState;
    const cash = portfolio.cash_balance;
    const totalValue = cash + positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);

    // Check defensive mode conditions
    const drawdownPct = ((autopilot.peakPortfolioValue - totalValue) / autopilot.peakPortfolioValue) * 100;
    if (totalValue > autopilot.peakPortfolioValue) {
      await saveAutopilotSettings({ ...autopilot, peakPortfolioValue: totalValue });
    }

    if (drawdownPct > 8 || autopilot.consecutiveLosses >= 3) {
      if (!autopilot.defensiveMode) {
        const reason = drawdownPct > 8
          ? `Portfolio down ${drawdownPct.toFixed(1)}% from peak — capital protection mode`
          : `${autopilot.consecutiveLosses} consecutive losses — cooling off`;
        await saveAutopilotSettings({ ...autopilot, defensiveMode: true, defensiveModeReason: reason });
        await createAlert(portfolio.id, 'DEFENSIVE_MODE', '🛡️ Defensive Mode Activated', reason);
      }
      return NextResponse.json({ skipped: true, reason: 'Defensive mode active — no new positions' });
    }

    // Restore from defensive mode if conditions resolved
    if (autopilot.defensiveMode && drawdownPct < 5 && autopilot.consecutiveLosses < 2) {
      await saveAutopilotSettings({ ...autopilot, defensiveMode: false, defensiveModeReason: null });
    }

    // Check if SPY dropped 2%+ today (market risk-off)
    let spyDrop = false;
    try {
      const spyQuote = await getQuote('SPY');
      if (spyQuote && spyQuote.changePercent < -2) spyDrop = true;
    } catch { /* ignore */ }

    if (spyDrop) {
      await createAlert(portfolio.id, 'MARKET_ALERT', '⚠️ Market Alert — High Risk', 'SPY dropped 2%+ today. AlphaBot switching to defensive mode — no new positions until volatility settles.', 'SPY');
      return NextResponse.json({ skipped: true, reason: 'Market-wide risk-off — SPY down 2%+' });
    }

    await logActivity(portfolio.id, 'SCAN_START', `🔍 Scanning ${WATCHLIST.length} stocks for setups...`);

    const research = await Promise.all(WATCHLIST.map(sym => researchStock(sym)));
    await logActivity(portfolio.id, 'ANALYSIS', '📊 Technical analysis complete for all symbols');

    const today = new Date().toISOString().split('T')[0];

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ skipped: true, reason: 'ANTHROPIC_API_KEY not configured' });
    }

    await logActivity(portfolio.id, 'AI_ANALYSIS', '🤖 Senior Trader AI analyzing setups...');
    const claudeResult = await callSeniorTraderClaude(research, cash, positions, session, today);

    // Log skipped symbols
    for (const s of claudeResult.skipped_symbols ?? []) {
      await logActivity(portfolio.id, 'SKIP', `💤 Skipped ${s.symbol} — ${s.reason}`, s.symbol);
    }

    // Check if bot recommends defensive mode
    if (claudeResult.defensive_mode_recommended) {
      const reason = claudeResult.defensive_mode_reason ?? 'Market conditions unfavorable';
      await saveAutopilotSettings({ ...autopilot, defensiveMode: true, defensiveModeReason: reason });
      await createAlert(portfolio.id, 'DEFENSIVE_MODE', '⚠️ Market Alert', reason);
    }

    const executedTrades: string[] = [];
    let currentCash = cash;

    // Auto-execute recommendations
    for (const rec of claudeResult.recommendations) {
      const existingPos = positions.find(p => p.symbol === rec.symbol);

      // Enforce cash reserve
      if (rec.action === 'BUY') {
        const cost = rec.shares * rec.buy_at_price;
        if (currentCash - cost < 800) {
          await logActivity(portfolio.id, 'SKIP', `💤 Skipped ${rec.symbol} — would breach $800 cash reserve`, rec.symbol);
          continue;
        }
      }

      const result = await executeTradeInSupabase(portfolio.id, existingPos as SupabasePosition | undefined, rec, currentCash);

      if (result.success) {
        const cost = rec.shares * rec.buy_at_price;
        if (rec.action === 'BUY') currentCash -= cost;
        else currentCash += cost;

        const emoji = rec.action === 'BUY' ? '🟢' : '🔴';
        const msg = `${emoji} ${rec.action === 'BUY' ? 'BOUGHT' : 'SOLD'} ${rec.shares}x ${rec.symbol} @ $${rec.buy_at_price.toFixed(2)} — Confidence: ${(rec.confidence * 100).toFixed(0)}%`;
        await logActivity(portfolio.id, rec.action, msg, rec.symbol, { rec });

        const alertBody = rec.action === 'BUY'
          ? `AlphaBot bought ${rec.shares} shares of ${rec.symbol} at $${rec.buy_at_price.toFixed(2)} — ${rec.reasoning}`
          : `AlphaBot sold ${rec.shares} shares of ${rec.symbol} at $${rec.buy_at_price.toFixed(2)}`;
        await createAlert(portfolio.id, `TRADE_${rec.action}`, `${emoji} TRADE ${rec.action === 'BUY' ? 'OPENED' : 'CLOSED'}: ${rec.symbol}`, alertBody, rec.symbol);

        executedTrades.push(`${rec.action} ${rec.shares}x ${rec.symbol}`);
      }
    }

    if (executedTrades.length === 0) {
      await logActivity(portfolio.id, 'NO_TRADES', `💤 AlphaBot ran — no qualifying setups found, cash preserved`);
      await createAlert(portfolio.id, 'NO_TRADES', '💤 No Trades', `AlphaBot ran at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET — no qualifying setups found. ${claudeResult.market_summary}`);
    }

    // Take portfolio snapshot
    if (hasSupabase) {
      const { createAdminClient } = await import('@/lib/supabase');
      const supabase = createAdminClient();
      const { data: freshPositions } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id);
      const { data: freshPortfolio } = await supabase.from('portfolios').select('cash_balance').eq('id', portfolio.id).single();
      const freshCash = (freshPortfolio as { cash_balance: number } | null)?.cash_balance ?? currentCash;
      const freshTotal = freshCash + (freshPositions ?? []).reduce((s: number, p: { shares: number; avg_cost_basis: number }) => s + p.shares * p.avg_cost_basis, 0);
      await supabase.from('portfolio_snapshots').insert({ portfolio_id: portfolio.id, total_value: freshTotal });
    }

    return NextResponse.json({
      success: true,
      session,
      tradesExecuted: executedTrades,
      marketSummary: claudeResult.market_summary,
      planForTomorrow: claudeResult.plan_for_tomorrow,
    });
  } catch (error) {
    console.error('Autopilot run error:', error);
    return NextResponse.json({ error: 'Autopilot run failed', details: String(error) }, { status: 500 });
  }
}
