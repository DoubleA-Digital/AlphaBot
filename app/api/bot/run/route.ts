import { NextResponse } from 'next/server';
import { getQuote, getHistory } from '@/lib/market';
import { generateMockQuote, generateMockHistory } from '@/lib/mockData';
import { computeIndicators } from '@/lib/indicators';
import type { ClaudeRecommendation } from '@/types';

const WATCHLIST = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','JPM','BAC','SPY','QQQ','PLTR','SOFI','CRWD','PYPL','NFLX','DIS','RIVN','ROKU'];

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

export const memPortfolioState = { cash: 4000 };
export const memPositions: Array<{ symbol: string; shares: number; avg_cost_basis: number }> = [];

const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc', MSFT: 'Microsoft', GOOGL: 'Alphabet', AMZN: 'Amazon', NVDA: 'NVIDIA',
  META: 'Meta Platforms', TSLA: 'Tesla', AMD: 'Advanced Micro Devices', JPM: 'JPMorgan Chase',
  BAC: 'Bank of America', SPY: 'S&P 500 ETF', QQQ: 'Nasdaq 100 ETF', PLTR: 'Palantir',
  SOFI: 'SoFi Technologies', CRWD: 'CrowdStrike', PYPL: 'PayPal', NFLX: 'Netflix',
  DIS: 'Disney', RIVN: 'Rivian', ROKU: 'Roku',
};

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
  } catch {
    return [];
  }
}

async function researchStock(symbol: string): Promise<StockResearch> {
  let [quote, history] = await Promise.all([getQuote(symbol), getHistory(symbol, 90)]);
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

  const insufficientData = fullHistory.length < 50;
  const indicators = computeIndicators(symbol, fullHistory) as StockResearch['indicators'];

  if (!insufficientData) {
    const closes = fullHistory.map(b => b.close);
    const last = closes.length - 1;
    if (last >= 5) {
      indicators.momentum5d = ((closes[last] - closes[last - 5]) / closes[last - 5]) * 100;
    }
    if (last >= 20) {
      indicators.momentum20d = ((closes[last] - closes[last - 20]) / closes[last - 20]) * 100;
    }
  }

  const news = await fetchNews(symbol);

  return { symbol, price: quote.price, indicators, news, insufficientData };
}

function buildUserMessage(
  research: StockResearch[],
  cash: number,
  positions: typeof memPositions,
  today: string
): string {
  const portfolioSection = JSON.stringify({
    cash_balance: cash,
    positions: positions.map(p => ({
      symbol: p.symbol,
      shares: p.shares,
      avg_cost: p.avg_cost_basis,
      current_value: p.shares * (research.find(r => r.symbol === p.symbol)?.price ?? p.avg_cost_basis),
    })),
    total_value: cash + positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0),
  }, null, 2);

  const stocksSection = research.map(r => {
    if (r.insufficientData) return `${r.symbol}: Insufficient data`;
    const ind = r.indicators;
    return `${r.symbol} ($${r.price.toFixed(2)}):
  RSI14=${ind.rsi14?.toFixed(1) ?? 'N/A'}, MACD=${ind.macd?.macd.toFixed(3) ?? 'N/A'} (signal=${ind.macd?.signal.toFixed(3) ?? 'N/A'}, hist=${ind.macd?.histogram.toFixed(3) ?? 'N/A'})
  SMA20=${ind.sma20?.toFixed(2) ?? 'N/A'}, SMA50=${ind.sma50?.toFixed(2) ?? 'N/A'}
  BB upper=${ind.bollingerBands?.upper.toFixed(2) ?? 'N/A'}, lower=${ind.bollingerBands?.lower.toFixed(2) ?? 'N/A'}
  VolumeRatio=${ind.volumeRatio?.toFixed(2) ?? 'N/A'}
  Momentum5d=${ind.momentum5d?.toFixed(2) ?? 'N/A'}%, Momentum20d=${ind.momentum20d?.toFixed(2) ?? 'N/A'}%
  News: ${r.news.length > 0 ? r.news.map(n => `"${n.headline}" [${n.sentiment}]`).join(' | ') : 'None'}`;
  }).join('\n\n');

  return `Today: ${today}

PORTFOLIO STATE:
${portfolioSection}

STOCK RESEARCH DATA (all 20 watchlist stocks):
${stocksSection}

Analyze all stocks. Identify 2-4 BEST opportunities. Be conservative with the $4,000 portfolio. Output ONLY valid JSON matching the schema exactly.`;
}

function mockRecommendations(research: StockResearch[]): ClaudeRecommendation[] {
  const available = research.filter(r => !r.insufficientData).slice(0, 2);
  return available.map((r, i) => ({
    action: 'BUY' as const,
    symbol: r.symbol,
    shares: i === 0 ? 3 : 2,
    buy_at_price: r.price,
    sell_target_price: parseFloat((r.price * 1.08).toFixed(2)),
    stop_loss_price: parseFloat((r.price * 0.94).toFixed(2)),
    confidence: 0.65,
    risk_level: 'MEDIUM' as const,
    reasoning: `Demo mode — AlphaBot recommends ${r.symbol} based on current price momentum and technical setup. Add ANTHROPIC_API_KEY for real AI analysis.`,
    key_signals: ['Demo mode', 'Mock recommendation'],
    expected_timeframe: '7-14 days',
    estimated_profit: `$${((r.price * 0.08) * (i === 0 ? 3 : 2)).toFixed(2)}`,
    estimated_loss: `$${((r.price * 0.06) * (i === 0 ? 3 : 2)).toFixed(2)}`,
  }));
}

interface ClaudeResponse {
  market_summary: string;
  recommendations: ClaudeRecommendation[];
  do_not_touch: string[];
  do_not_touch_reasons: string[];
  portfolio_health_score: number;
  monthly_return_projection: string;
}

async function callClaude(userMessage: string): Promise<ClaudeResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are AlphaBot, an elite quantitative trading analyst managing a $4,000 paper portfolio for maximum 30-day returns. Analyze ALL provided stock data and identify the 2-4 BEST trades available RIGHT NOW based on strongest signal convergence. Be conservative — portfolio is small. Never put more than 25% ($1,000) into a single position. Output ONLY valid JSON, no markdown.

Return this exact JSON structure:
{
  "market_summary": "string",
  "recommendations": [
    {
      "action": "BUY",
      "symbol": "NVDA",
      "shares": 3,
      "buy_at_price": 128.50,
      "sell_target_price": 145.00,
      "stop_loss_price": 121.00,
      "confidence": 0.84,
      "risk_level": "MEDIUM",
      "reasoning": "string",
      "key_signals": ["string"],
      "expected_timeframe": "7-14 days",
      "estimated_profit": "$49.50",
      "estimated_loss": "$22.50"
    }
  ],
  "do_not_touch": ["TSLA"],
  "do_not_touch_reasons": ["TSLA: RSI overbought at 78"],
  "portfolio_health_score": 82,
  "monthly_return_projection": "8-14%"
}`;

  async function attempt(strict: boolean): Promise<ClaudeResponse> {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: strict
            ? userMessage + '\n\nCRITICAL: Output ONLY the JSON object. No markdown, no code fences, no explanation. Start your response with { and end with }'
            : userMessage,
        },
      ],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');
    return JSON.parse(jsonMatch[0]) as ClaudeResponse;
  }

  try {
    return await attempt(false);
  } catch {
    return await attempt(true);
  }
}

async function getPortfolioFromSupabase() {
  const { createAdminClient } = await import('@/lib/supabase');
  const supabase = createAdminClient();
  let { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);
  if (!portfolios || portfolios.length === 0) {
    const { data: np } = await supabase.from('portfolios').insert({ cash_balance: 4000 }).select().single();
    portfolios = np ? [np] : [];
  }
  const portfolio = portfolios?.[0];
  if (!portfolio) throw new Error('Could not create portfolio');
  const { data: positions } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id);
  return { cash: portfolio.cash_balance as number, positions: (positions ?? []) as Array<{ symbol: string; shares: number; avg_cost_basis: number }> };
}

export async function POST() {
  try {
    const researchResults = await Promise.all(WATCHLIST.map(sym => researchStock(sym)));

    let cash: number;
    let positions: typeof memPositions;

    if (hasSupabase) {
      const state = await getPortfolioFromSupabase();
      cash = state.cash;
      positions = state.positions;
    } else {
      cash = memPortfolioState.cash;
      positions = memPositions;
    }

    const posVal = positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);
    const totalValue = cash + posVal;
    const today = new Date().toISOString().split('T')[0];

    const researchMap: Record<string, { indicators: StockResearch['indicators']; news: StockResearch['news'] }> = {};
    for (const r of researchResults) {
      researchMap[r.symbol] = { indicators: r.indicators, news: r.news };
    }

    let claudeResult: ClaudeResponse;
    let mode: 'live' | 'demo' = 'demo';

    if (process.env.ANTHROPIC_API_KEY) {
      const userMessage = buildUserMessage(researchResults, cash, positions, today);
      claudeResult = await callClaude(userMessage);
      mode = 'live';
    } else {
      const recs = mockRecommendations(researchResults);
      claudeResult = {
        market_summary: 'Demo mode — add ANTHROPIC_API_KEY for real AI analysis.',
        recommendations: recs,
        do_not_touch: [],
        do_not_touch_reasons: [],
        portfolio_health_score: 70,
        monthly_return_projection: 'N/A (demo)',
      };
    }

    return NextResponse.json({
      success: true,
      marketSummary: claudeResult.market_summary,
      recommendations: claudeResult.recommendations,
      doNotTouch: claudeResult.do_not_touch ?? [],
      doNotTouchReasons: claudeResult.do_not_touch_reasons ?? [],
      portfolioHealthScore: claudeResult.portfolio_health_score,
      monthlyReturnProjection: claudeResult.monthly_return_projection,
      researchData: researchMap,
      portfolioState: { cash, positions, totalValue },
      mode,
    });
  } catch (error) {
    console.error('Bot run error:', error);
    return NextResponse.json({ error: 'Bot run failed', details: String(error) }, { status: 500 });
  }
}
