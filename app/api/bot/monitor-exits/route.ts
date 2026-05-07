import { NextResponse } from 'next/server';
import { getQuote } from '@/lib/market';
import { generateMockQuote } from '@/lib/mockData';
import { getAutopilotSettings, saveAutopilotSettings, isMarketOpen, logActivity, createAlert } from '@/lib/autopilot';
import { computeIndicators } from '@/lib/indicators';
import { getHistory } from '@/lib/market';
import { generateMockHistory } from '@/lib/mockData';

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

interface SupabasePosition {
  id: string;
  symbol: string;
  shares: number;
  avg_cost_basis: number;
  sell_target?: number | null;
  stop_loss?: number | null;
  bought_at?: string | null;
}

function tradingDaysBetween(from: string | null | undefined, to: Date): number {
  if (!from) return 0;
  const start = new Date(from);
  let count = 0;
  const cur = new Date(start);
  while (cur < to) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export async function GET() { return runExitMonitor(); }
export async function POST() { return runExitMonitor(); }

async function runExitMonitor() {
  try {
    const autopilot = await getAutopilotSettings();
    if (!autopilot.isEnabled) {
      return NextResponse.json({ skipped: true, reason: 'Autopilot disabled' });
    }
    if (!isMarketOpen()) {
      return NextResponse.json({ skipped: true, reason: 'Market closed' });
    }
    if (!hasSupabase) {
      return NextResponse.json({ skipped: true, reason: 'Supabase required for exit monitoring' });
    }

    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();

    const { data: portfolios } = await supabase.from('portfolios').select('*').limit(1);
    const portfolio = portfolios?.[0];
    if (!portfolio) return NextResponse.json({ skipped: true, reason: 'No portfolio' });

    const { data: rawPositions } = await supabase.from('positions').select('*').eq('portfolio_id', portfolio.id);
    const positions = (rawPositions ?? []) as SupabasePosition[];

    if (positions.length === 0) {
      return NextResponse.json({ message: 'No open positions to monitor', positions: 0 });
    }

    await logActivity(portfolio.id, 'MONITOR', `👁️ Monitoring ${positions.length} open position${positions.length !== 1 ? 's' : ''}...`);

    const now = new Date();
    const exitActions: Array<{ symbol: string; reason: string; price: number }> = [];

    for (const pos of positions) {
      let quote = await getQuote(pos.symbol);
      if (!quote) quote = generateMockQuote(pos.symbol);
      const currentPrice = quote.price;

      let history = await getHistory(pos.symbol, 60);
      if (!history || history.length < 5) history = generateMockHistory(pos.symbol, 60);
      const fullHistory = [
        ...history,
        { date: now.toISOString().split('T')[0], open: quote.open, high: quote.high, low: quote.low, close: currentPrice, volume: quote.volume },
      ];
      const indicators = computeIndicators(pos.symbol, fullHistory);
      const rsi = indicators.rsi14 ?? 50;
      const macdHist = indicators.macd?.histogram ?? 0;
      const daysHeld = tradingDaysBetween(pos.bought_at, now);
      const pnl = (currentPrice - pos.avg_cost_basis) * pos.shares;
      const isProfitable = pnl > 0;

      let exitReason: string | null = null;

      // Log current status
      const pnlPct = ((currentPrice - pos.avg_cost_basis) / pos.avg_cost_basis * 100);
      await logActivity(
        portfolio.id, 'MONITOR_CHECK',
        `👁️ ${pos.symbol} $${currentPrice.toFixed(2)} — ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% | RSI ${rsi.toFixed(0)} | Days held: ${daysHeld}`,
        pos.symbol
      );

      // Log to exit_checks table
      await supabase.from('exit_checks').insert({
        position_id: pos.id,
        symbol: pos.symbol,
        current_price: currentPrice,
        stop_loss_price: pos.stop_loss ?? null,
        target_price: pos.sell_target ?? null,
        rsi,
        macd_histogram: macdHist,
        days_held: daysHeld,
        action_taken: 'MONITOR',
        reason: `RSI=${rsi.toFixed(1)}, MACD hist=${macdHist.toFixed(3)}, P&L=${pnlPct.toFixed(1)}%`,
      });

      // Check exit conditions
      if (pos.stop_loss && currentPrice <= pos.stop_loss) {
        exitReason = `Stop loss triggered at $${pos.stop_loss.toFixed(2)} — protected from further losses`;
      } else if (pos.sell_target && currentPrice >= pos.sell_target) {
        exitReason = `Take-profit target $${pos.sell_target.toFixed(2)} reached — locking in gains`;
      } else if (rsi > 75) {
        exitReason = `RSI overbought at ${rsi.toFixed(0)} — smart money selling, following suit`;
      } else if (isProfitable && macdHist < -0.05) {
        exitReason = `MACD histogram turned negative (${macdHist.toFixed(3)}) after profitable run — momentum dying`;
      } else if (daysHeld > 5) {
        exitReason = `Time stop: ${daysHeld} trading days held without hitting target — freeing capital`;
      }

      if (exitReason) {
        exitActions.push({ symbol: pos.symbol, reason: exitReason, price: currentPrice });

        // Execute the sell
        const proceeds = pos.shares * currentPrice;
        const newCash = portfolio.cash_balance + proceeds;

        if (pos.shares - pos.shares < 0.001) {
          await supabase.from('positions').delete().eq('id', pos.id);
        } else {
          await supabase.from('positions').update({ shares: 0 }).eq('id', pos.id);
          await supabase.from('positions').delete().eq('id', pos.id);
        }

        await supabase.from('portfolios').update({ cash_balance: newCash }).eq('id', portfolio.id);
        await supabase.from('trades').insert({
          portfolio_id: portfolio.id,
          symbol: pos.symbol,
          action: 'SELL',
          shares: pos.shares,
          price: currentPrice,
          total_value: proceeds,
          reasoning: `[AUTO-EXIT] ${exitReason}`,
          confidence: 0.95,
        });

        // Update consecutive losses
        if (!isProfitable) {
          const newLosses = autopilot.consecutiveLosses + 1;
          await saveAutopilotSettings({ ...autopilot, consecutiveLosses: newLosses });
        } else {
          await saveAutopilotSettings({ ...autopilot, consecutiveLosses: 0 });
        }

        // Log activity
        const isStopLoss = pos.stop_loss && currentPrice <= pos.stop_loss;
        const isTarget = pos.sell_target && currentPrice >= pos.sell_target;
        const isTimStop = daysHeld > 5;
        const emoji = isTarget ? '🎯' : isTimStop ? '⏰' : '🔴';
        const eventType = isTarget ? 'TARGET_HIT' : isTimStop ? 'TIME_STOP' : 'STOP_LOSS';

        await logActivity(
          portfolio.id, eventType,
          `${emoji} SOLD ${pos.shares}x ${pos.symbol} @ $${currentPrice.toFixed(2)} — ${exitReason}`,
          pos.symbol
        );

        const alertPnl = pnl >= 0 ? `+$${pnl.toFixed(2)} profit` : `-$${Math.abs(pnl).toFixed(2)} loss`;
        let alertTitle = `${emoji} TRADE CLOSED: ${pos.symbol}`;
        let alertBody = '';

        if (isStopLoss) {
          alertTitle = `🔴 TRADE CLOSED (stop hit): ${pos.symbol}`;
          alertBody = `AlphaBot exited ${pos.symbol} at $${currentPrice.toFixed(2)} — stop loss triggered, ${alertPnl}`;
        } else if (isTarget) {
          alertTitle = `🎯 TRADE CLOSED (target hit): ${pos.symbol}`;
          alertBody = `AlphaBot closed ${pos.symbol} position at $${currentPrice.toFixed(2)} — target reached, ${alertPnl}`;
        } else if (isTimStop) {
          alertTitle = `⏰ TIME STOP: ${pos.symbol}`;
          alertBody = `AlphaBot exited ${pos.symbol} — ${daysHeld} days held without hitting target, capital freed for better opportunities`;
        } else {
          alertBody = `AlphaBot auto-exited ${pos.symbol} at $${currentPrice.toFixed(2)} — ${exitReason}. ${alertPnl}`;
        }

        await createAlert(portfolio.id, eventType, alertTitle, alertBody, pos.symbol);
      }
    }

    return NextResponse.json({
      success: true,
      positionsChecked: positions.length,
      exitsExecuted: exitActions.length,
      exits: exitActions,
    });
  } catch (error) {
    console.error('Exit monitor error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
