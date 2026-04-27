import Anthropic from '@anthropic-ai/sdk';
import type { TechnicalIndicators, ClaudeDecision, Portfolio, Position } from '@/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are AlphaBot, an expert quantitative trading analyst and portfolio manager specializing in technical analysis and risk management. You analyze stock market data and make precise trading decisions for a paper trading simulation.

CRITICAL RULES:
1. You MUST respond with ONLY valid JSON, no markdown, no explanation outside JSON
2. Never exceed 20% of portfolio value in a single position
3. Never recommend a trade that would cause total drawdown > 15%
4. Always provide detailed reasoning (2-4 sentences minimum)
5. Factor in market regime (trending vs ranging) when making decisions
6. Compare current signals vs historical baselines

OUTPUT FORMAT (strict JSON):
{
  "action": "BUY | SELL | HOLD",
  "symbol": "TICKER",
  "shares": number,
  "reasoning": "detailed reasoning string",
  "confidence": 0.0-1.0,
  "risk_score": 0.0-1.0,
  "price_target": number,
  "stop_loss": number,
  "market_regime": "trending_up | trending_down | ranging",
  "key_signals": ["signal1", "signal2"]
}`;

export async function analyzeStock(
  indicators: TechnicalIndicators,
  portfolio: Portfolio,
  positions: Position[],
  totalPortfolioValue: number
): Promise<ClaudeDecision> {
  const currentPosition = positions.find(p => p.symbol === indicators.symbol);
  const positionValue = currentPosition
    ? currentPosition.shares * indicators.price
    : 0;

  const userMessage = `Analyze ${indicators.symbol} and make a trading decision.

PORTFOLIO STATE:
- Total Portfolio Value: $${totalPortfolioValue.toFixed(2)}
- Cash Available: $${portfolio.cash_balance.toFixed(2)}
- Current Position in ${indicators.symbol}: ${currentPosition ? `${currentPosition.shares} shares at avg cost $${currentPosition.avg_cost_basis}` : 'None'}
- Position Value: $${positionValue.toFixed(2)}
- Max allowed position size: $${(totalPortfolioValue * 0.20).toFixed(2)} (20% of portfolio)

TECHNICAL INDICATORS for ${indicators.symbol}:
- Current Price: $${indicators.price}
- RSI (14-day): ${indicators.rsi14?.toFixed(2) ?? 'N/A'}
- MACD: ${indicators.macd ? `MACD: ${indicators.macd.macd.toFixed(4)}, Signal: ${indicators.macd.signal.toFixed(4)}, Histogram: ${indicators.macd.histogram.toFixed(4)}` : 'N/A'}
- SMA 20-day: ${indicators.sma20?.toFixed(2) ?? 'N/A'}
- SMA 50-day: ${indicators.sma50?.toFixed(2) ?? 'N/A'}
- Bollinger Bands: ${indicators.bollingerBands ? `Upper: $${indicators.bollingerBands.upper.toFixed(2)}, Middle: $${indicators.bollingerBands.middle.toFixed(2)}, Lower: $${indicators.bollingerBands.lower.toFixed(2)}` : 'N/A'}
- Volume Ratio vs 20-day avg: ${indicators.volumeRatio?.toFixed(2) ?? 'N/A'}x
- 52-Week High: $${indicators.weekHigh52?.toFixed(2) ?? 'N/A'} (${indicators.weekHighProximity52?.toFixed(1) ?? 'N/A'}% from current)
- 52-Week Low: $${indicators.weekLow52?.toFixed(2) ?? 'N/A'} (${indicators.weekLowProximity52?.toFixed(1) ?? 'N/A'}% from current)

RISK CONSTRAINTS:
- Maximum drawdown allowed: 15%
- Maximum single position: 20% of total portfolio
- This is a paper trading simulation

Respond with ONLY the JSON object.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Non-text response from Claude');

    let jsonText = content.text.trim();
    // Strip markdown code fences if present
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

    const decision = JSON.parse(jsonText) as ClaudeDecision;
    return decision;
  } catch {
    // Retry with stricter prompt
    const retryResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\nCRITICAL: Your previous response was not valid JSON. Respond with ONLY the raw JSON object, absolutely no other text.',
      messages: [
        {
          role: 'user',
          content: `Return ONLY a JSON object for ${indicators.symbol} at price $${indicators.price}. RSI: ${indicators.rsi14?.toFixed(2)}. Cash: $${portfolio.cash_balance.toFixed(2)}. Total portfolio: $${totalPortfolioValue.toFixed(2)}.`,
        },
      ],
    });

    const retryContent = retryResponse.content[0];
    if (retryContent.type !== 'text') throw new Error('Non-text response from Claude on retry');

    let retryJson = retryContent.text.trim();
    retryJson = retryJson.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

    return JSON.parse(retryJson) as ClaudeDecision;
  }
}

export async function generateResearchAnalysis(
  symbol: string,
  indicators: TechnicalIndicators,
  priceHistory: { date: string; close: number }[]
): Promise<{
  summary: string;
  outlook7day: string;
  outlook30day: string;
  priceTarget7day: number;
  priceTarget30day: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  keyRisks: string[];
  catalysts: string[];
}> {
  const recentPrices = priceHistory.slice(-10).map(p => `${p.date}: $${p.close}`).join(', ');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Analyze ${symbol} and provide a comprehensive research report.

Current Price: $${indicators.price}
RSI (14): ${indicators.rsi14?.toFixed(2)}
MACD Histogram: ${indicators.macd?.histogram.toFixed(4)}
SMA 20: $${indicators.sma20?.toFixed(2)}
SMA 50: $${indicators.sma50?.toFixed(2)}
Bollinger Upper: $${indicators.bollingerBands?.upper.toFixed(2)}, Lower: $${indicators.bollingerBands?.lower.toFixed(2)}
52W High: $${indicators.weekHigh52?.toFixed(2)}, 52W Low: $${indicators.weekLow52?.toFixed(2)}
Recent prices: ${recentPrices}

Respond with ONLY this JSON:
{
  "summary": "2-3 sentence technical analysis summary",
  "outlook7day": "1-2 sentence 7-day outlook",
  "outlook30day": "1-2 sentence 30-day outlook",
  "priceTarget7day": number,
  "priceTarget30day": number,
  "sentiment": "bullish|bearish|neutral",
  "keyRisks": ["risk1", "risk2", "risk3"],
  "catalysts": ["catalyst1", "catalyst2", "catalyst3"]
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Non-text response');

  let jsonText = content.text.trim();
  jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  return JSON.parse(jsonText);
}
