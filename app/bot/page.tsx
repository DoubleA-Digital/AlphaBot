'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Bot, Zap, ChevronDown, ChevronUp, TrendingUp, TrendingDown, X, CheckCircle, RotateCcw, DollarSign, Shield, PlayCircle } from 'lucide-react';
import { clsx } from 'clsx';
import MiniChart from '@/components/charts/MiniChart';
import type { ClaudeRecommendation, StockQuote, OHLCVBar } from '@/types';
import { DEFAULT_WATCHLIST } from '@/lib/constants';
import {
  loadPortfolio, savePortfolio, applyBuy, applySell, addSnapshot,
  computeTotalValue, defaultStore, type PortfolioStore, type StoredTrade,
} from '@/lib/portfolioStore';

const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc', MSFT: 'Microsoft', GOOGL: 'Alphabet', AMZN: 'Amazon', NVDA: 'NVIDIA',
  META: 'Meta Platforms', TSLA: 'Tesla', AMD: 'Advanced Micro Devices', JPM: 'JPMorgan Chase',
  BAC: 'Bank of America', SPY: 'S&P 500 ETF', QQQ: 'Nasdaq 100 ETF', PLTR: 'Palantir',
  SOFI: 'SoFi Technologies', CRWD: 'CrowdStrike', PYPL: 'PayPal', NFLX: 'Netflix',
  DIS: 'Disney', RIVN: 'Rivian', ROKU: 'Roku',
};

interface WatchlistItem { quote: StockQuote; history: OHLCVBar[] }
interface Toast { id: number; message: string; type: 'success' | 'error' }
interface RunResult {
  marketSummary: string;
  recommendations: ClaudeRecommendation[];
  doNotTouch: string[];
  doNotTouchReasons: string[];
  portfolioHealthScore: number;
  monthlyReturnProjection: string;
  portfolioState: { cash: number; positions: unknown[]; totalValue: number };
  mode: 'live' | 'demo';
}
interface DecisionLogEntry {
  symbol: string;
  action: string;
  shares: number;
  price: number;
  approved: boolean;
  timestamp: string;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function timeTag() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export default function BotPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stocksReady, setStocksReady] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [approvedMap, setApprovedMap] = useState<Record<number, boolean>>({});
  const [approvingMap, setApprovingMap] = useState<Record<number, boolean>>({});
  const [skippedMap, setSkippedMap] = useState<Record<number, boolean>>({});
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [decisionLog, setDecisionLog] = useState<DecisionLogEntry[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [watchlist, setWatchlist] = useState<Map<string, WatchlistItem>>(new Map());
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [runSummary, setRunSummary] = useState<{
    approved: number; skipped: number; deployed: number; remaining: number; projected: number;
  } | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioStore | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [autopilotOn, setAutopilotOn] = useState(false);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);

  // Fetch autopilot state
  useEffect(() => {
    const fetchAP = async () => {
      try {
        const r = await fetch('/api/autopilot');
        const d = await r.json();
        setAutopilotOn(d.isEnabled ?? false);
      } catch { /* silent */ }
    };
    fetchAP();
    const i = setInterval(fetchAP, 15000);
    return () => clearInterval(i);
  }, []);

  async function triggerAutopilotNow() {
    setAutopilotRunning(true);
    addLog('🤖 Manually triggering Autopilot run...');
    try {
      const r = await fetch('/api/bot/autopilot-run', { method: 'POST' });
      const d = await r.json();
      if (d.skipped) {
        addLog(`⏭️ Skipped: ${d.reason}`);
      } else if (d.success) {
        addLog(`✅ Autopilot run complete — ${d.tradesExecuted?.length ?? 0} trade(s) executed`);
        if (d.tradesExecuted?.length > 0) {
          for (const t of d.tradesExecuted) addLog(`  → ${t}`);
        }
      }
    } catch (err) {
      addLog(`ERROR: ${err instanceof Error ? err.message : 'Autopilot run failed'}`);
    } finally {
      setAutopilotRunning(false);
    }
  }

  async function triggerExitMonitor() {
    addLog('👁️ Running exit monitor...');
    try {
      const r = await fetch('/api/bot/monitor-exits', { method: 'POST' });
      const d = await r.json();
      if (d.skipped) {
        addLog(`⏭️ Monitor skipped: ${d.reason}`);
      } else {
        addLog(`✅ Exit monitor complete — ${d.positionsChecked ?? 0} checked, ${d.exitsExecuted ?? 0} exit(s) triggered`);
      }
    } catch (err) {
      addLog(`ERROR: ${err instanceof Error ? err.message : 'Monitor failed'}`);
    }
  }

  // Load portfolio from localStorage on mount
  useEffect(() => {
    const stored = loadPortfolio();
    setPortfolio(stored);
    setDecisionLog(stored.trades.map((t: StoredTrade) => ({
      symbol: t.symbol, action: t.action, shares: t.shares,
      price: t.price, approved: true, timestamp: t.timestamp,
    })));
  }, []);

  // Update live prices every 60s
  useEffect(() => {
    const updatePrices = async () => {
      try {
        const res = await fetch(`/api/market/quotes?symbols=${DEFAULT_WATCHLIST.join(',')}`);
        const data = await res.json();
        const prices: Record<string, number> = {};
        for (const [sym, q] of Object.entries(data.quotes ?? {})) {
          prices[sym] = (q as { price: number }).price;
        }
        setLivePrices(prices);
        // Also update portfolio total value with fresh prices
        setPortfolio(prev => {
          if (!prev) return prev;
          return { ...prev };
        });
      } catch { /* silent */ }
    };
    updatePrices();
    const interval = setInterval(updatePrices, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/market/quotes?symbols=${DEFAULT_WATCHLIST.join(',')}`);
        const data = await res.json();
        const map = new Map<string, WatchlistItem>();
        for (const sym of DEFAULT_WATCHLIST.slice(0, 10)) {
          const quote = data.quotes?.[sym];
          if (!quote) continue;
          try {
            const hRes = await fetch(`/api/market/history?symbol=${sym}&days=14`);
            const hData = await hRes.json();
            map.set(sym, { quote, history: hData.history ?? [] });
          } catch {
            map.set(sym, { quote, history: [] });
          }
        }
        setWatchlist(map);
      } catch { /* silent */ }
      finally { setWatchlistLoading(false); }
    };
    load();
  }, []);

  function addLog(line: string) {
    setLogs(prev => [...prev, `[${timeTag()}] ${line}`]);
  }

  function pushToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }

  // Always read fresh from localStorage to avoid stale state race conditions
  function getFreshPortfolio(): PortfolioStore {
    return loadPortfolio();
  }

  const runBot = useCallback(async () => {
    setIsRunning(true);
    setLogs([]);
    setStocksReady(0);
    setResult(null);
    setApprovedMap({});
    setApprovingMap({});
    setSkippedMap({});
    setRunSummary(null);

    addLog('Fetching live prices for 20 stocks...');

    const stockInterval = setInterval(() => {
      setStocksReady(prev => {
        if (prev >= 20) { clearInterval(stockInterval); return 20; }
        return prev + 1;
      });
    }, 180);

    setTimeout(() => addLog('Computing RSI, MACD, Bollinger Bands for all symbols...'), 1800);
    setTimeout(() => addLog('Fetching news headlines...'), 3200);
    setTimeout(() => addLog('Sending data to Claude AI for analysis...'), 4500);

    try {
      // Pass real portfolio state so Claude knows actual available funds
      const currentPortfolio = getFreshPortfolio();
      const res = await fetch('/api/bot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentCash: currentPortfolio.cash,
          currentPositions: currentPortfolio.positions,
        }),
      });
      clearInterval(stockInterval);
      setStocksReady(20);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Bot run failed');
      }

      const data = await res.json();
      const recCount = data.recommendations?.length ?? 0;
      addLog(`Analysis complete. ${recCount} recommendation${recCount !== 1 ? 's' : ''} generated.`);

      setResult(data);
      setOverlayOpen(true);
    } catch (err) {
      addLog(`ERROR: ${err instanceof Error ? err.message : 'Bot run failed'}`);
      clearInterval(stockInterval);
    } finally {
      setIsRunning(false);
    }
  }, []);

  async function approveTrade(rec: ClaudeRecommendation, index: number) {
    if (approvingMap[index] || approvedMap[index]) return;
    setApprovingMap(prev => ({ ...prev, [index]: true }));

    try {
      // CRITICAL: Always read fresh from localStorage (not React state)
      // to avoid race conditions when approving multiple trades
      const currentPortfolio = getFreshPortfolio();

      const res = await fetch('/api/bot/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: rec.symbol,
          action: rec.action,
          shares: rec.shares,
          price: rec.buy_at_price,
          reasoning: rec.reasoning,
          confidence: rec.confidence,
          sell_target: rec.sell_target_price,
          stop_loss: rec.stop_loss_price,
          currentCash: currentPortfolio.cash,
          currentPositions: currentPortfolio.positions,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        pushToast(err.error ?? 'Trade failed', 'error');
        return;
      }

      // Apply to localStorage — read fresh again after API call completes
      // to ensure we have the very latest state (another trade may have completed)
      const latestPortfolio = getFreshPortfolio();
      const applyResult = rec.action === 'SELL'
        ? applySell(latestPortfolio, rec.symbol, rec.shares, rec.buy_at_price, rec.reasoning, rec.confidence)
        : applyBuy(latestPortfolio, rec.symbol, rec.shares, rec.buy_at_price, rec.reasoning, rec.confidence, rec.sell_target_price, rec.stop_loss_price);

      if (applyResult.error) {
        pushToast(applyResult.error, 'error');
        return;
      }

      const withSnapshot = addSnapshot(applyResult.store, computeTotalValue(applyResult.store, livePrices));
      savePortfolio(withSnapshot);
      setPortfolio(withSnapshot);

      setApprovedMap(prev => ({ ...prev, [index]: true }));
      setDecisionLog(prev => [{
        symbol: rec.symbol,
        action: rec.action,
        shares: rec.shares,
        price: rec.buy_at_price,
        approved: true,
        timestamp: new Date().toISOString(),
      }, ...prev]);

      const totalCost = rec.shares * rec.buy_at_price;
      pushToast(
        `${rec.action === 'SELL' ? 'Sold' : 'Bought'} ${rec.shares}x ${rec.symbol} @ ${fmt(rec.buy_at_price)} — ${fmt(totalCost)} ${rec.action === 'SELL' ? 'received' : 'deducted'}`,
        'success'
      );
    } catch {
      pushToast('Trade execution failed', 'error');
    } finally {
      setApprovingMap(prev => ({ ...prev, [index]: false }));
    }
  }

  function skipTrade(index: number) {
    setSkippedMap(prev => ({ ...prev, [index]: true }));
  }

  async function approveAll() {
    if (!result) return;
    // Sequential — each trade must complete before the next starts
    // This is critical: parallel approval causes race conditions in localStorage
    for (let i = 0; i < result.recommendations.length; i++) {
      if (!approvedMap[i] && !skippedMap[i]) {
        await approveTrade(result.recommendations[i], i);
      }
    }
  }

  function skipAll() {
    if (!result) return;
    const newSkipped: Record<number, boolean> = {};
    result.recommendations.forEach((_, i) => { newSkipped[i] = true; });
    setSkippedMap(newSkipped);
  }

  function closeOverlay() {
    if (!result) return;
    const recs = result.recommendations;
    const approvedCount = Object.values(approvedMap).filter(Boolean).length;
    const skippedCount = recs.length - approvedCount;
    const deployed = recs.reduce((s, r, i) => approvedMap[i] ? s + r.shares * r.buy_at_price : s, 0);
    const currentPortfolio = getFreshPortfolio();
    const remaining = currentPortfolio.cash;
    const projected = remaining + recs.reduce((s, r, i) => approvedMap[i] ? s + r.shares * r.sell_target_price : s, 0);

    setRunSummary({ approved: approvedCount, skipped: skippedCount, deployed, remaining, projected });
    setOverlayOpen(false);
  }

  function resetPortfolio() {
    const fresh = defaultStore();
    savePortfolio(fresh);
    setPortfolio(fresh);
    setDecisionLog([]);
    setRunSummary(null);
    setResult(null);
    setLogs([]);
    setShowResetConfirm(false);
    pushToast('Portfolio reset to $4,000.00', 'success');
  }

  const riskColor = (r: string) =>
    r === 'LOW' ? 'text-[#AAFF00]' : r === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400';
  const riskBg = (r: string) =>
    r === 'LOW' ? 'bg-[#AAFF00]/10 border-[#AAFF00]/20 text-[#AAFF00]' : r === 'MEDIUM' ? 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400' : 'bg-red-400/10 border-red-400/20 text-red-400';

  const currentCash = portfolio?.cash ?? 4000;
  const currentTotalValue = portfolio ? computeTotalValue(portfolio, livePrices) : 4000;
  const overlayCash = getFreshPortfolio().cash;

  return (
    <div className="p-5 space-y-5 min-h-full" style={{ background: '#0a0a0a' }}>

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 z-[100] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={clsx(
              'rounded-lg px-4 py-3 text-xs font-mono shadow-lg pointer-events-auto max-w-sm',
              t.type === 'error'
                ? 'bg-red-950 border border-red-500/40 text-red-400'
                : 'bg-[#111] border border-[#AAFF00]/30 text-[#AAFF00]'
            )}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3" style={{ fontFamily: 'var(--font-syne)' }}>
            <div className={clsx('w-3 h-3 rounded-full flex-shrink-0', isRunning ? 'bg-[#AAFF00] animate-pulse' : 'bg-white/20')} />
            AlphaBot AI Agent
          </h1>
          <p className="text-white/40 text-xs font-mono mt-0.5">
            {isRunning ? 'Analyzing 20 stocks...' : result ? `Last run complete — ${result.recommendations.length} recommendations` : 'Idle — Ready to analyze 20 stocks'}
          </p>
        </div>

        {/* Portfolio balance pill */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2.5">
            <DollarSign size={13} className="text-[#AAFF00]" />
            <div>
              <div className="text-[10px] font-mono text-white/30 uppercase">Available Cash</div>
              <div className="font-mono font-bold text-white text-sm">{fmt(currentCash)}</div>
            </div>
            {portfolio && portfolio.positions.length > 0 && (
              <>
                <div className="w-px h-8 bg-white/10 mx-1" />
                <div>
                  <div className="text-[10px] font-mono text-white/30 uppercase">Total Value</div>
                  <div className="font-mono font-bold text-[#AAFF00] text-sm">{fmt(currentTotalValue)}</div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowResetConfirm(true)}
            title="Reset portfolio"
            className="p-2.5 rounded-lg border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/30 transition-all"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={runBot}
            disabled={isRunning}
            className={clsx(
              'flex items-center gap-2 px-6 py-3 rounded-md font-mono text-sm font-bold transition-all',
              isRunning
                ? 'bg-[#AAFF00]/20 border border-[#AAFF00]/40 text-[#AAFF00] cursor-not-allowed shadow-[0_0_30px_rgba(170,255,0,0.6)]'
                : 'bg-[#AAFF00] text-black hover:bg-[#AAFF00]/90 shadow-[0_0_20px_rgba(170,255,0,0.3)]'
            )}
          >
            {isRunning ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>Run Analysis</>
            )}
          </button>
        </div>
      </div>

      {/* Autopilot panel */}
      {autopilotOn ? (
        <div className="bg-green-500/5 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <div>
                <div className="text-green-400 font-mono font-bold text-sm">● AUTOPILOT ACTIVE</div>
                <div className="text-green-400/60 text-xs font-mono mt-0.5">Bot runs autonomously 6× daily · Monitors exits every 15 min · No approval required</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={triggerExitMonitor}
                className="flex items-center gap-1.5 px-3 py-2 border border-green-500/30 text-green-400/70 font-mono text-xs rounded hover:text-green-400 hover:border-green-500/60 transition-all"
              >
                <Shield size={12} />
                Check Exits
              </button>
              <button
                onClick={triggerAutopilotNow}
                disabled={autopilotRunning}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-black font-mono font-bold text-xs rounded hover:bg-green-400 transition-all disabled:opacity-60"
              >
                <PlayCircle size={13} />
                {autopilotRunning ? 'Running...' : 'Run Now'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-white/20 flex-shrink-0" />
            <div>
              <div className="text-white/50 font-mono text-sm">Autopilot is OFF — manual mode</div>
              <div className="text-white/25 text-xs font-mono mt-0.5">Each trade requires your approval. Enable Autopilot on the Dashboard.</div>
            </div>
          </div>
          <a href="/" className="px-4 py-2 border border-white/10 text-white/40 font-mono text-xs rounded hover:text-white hover:border-white/20 transition-all">
            Go to Dashboard →
          </a>
        </div>
      )}

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-red-400 text-sm font-mono font-bold">Reset portfolio to $4,000?</div>
            <div className="text-red-400/60 text-xs font-mono mt-0.5">This will clear all positions and trade history. Cannot be undone.</div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={resetPortfolio}
              className="px-4 py-2 bg-red-500 text-white font-mono font-bold text-xs rounded hover:bg-red-400 transition-all"
            >
              RESET
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 border border-white/20 text-white/50 font-mono text-xs rounded hover:text-white transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Terminal + Progress */}
      {(isRunning || logs.length > 0) && (
        <div className="space-y-2">
          {isRunning && (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/10 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#AAFF00] transition-all duration-300"
                  style={{ width: `${(stocksReady / 20) * 100}%` }}
                />
              </div>
              <span className="text-white/40 text-xs font-mono flex-shrink-0">Research complete for {stocksReady}/20 stocks</span>
            </div>
          )}
          <div className="bg-black border border-[#AAFF00]/20 rounded-lg p-4 font-mono text-xs text-[#AAFF00]/70 max-h-48 overflow-y-auto">
            {logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Post-run summary */}
      {runSummary && (
        <div className="bg-[#111] border border-[#AAFF00]/20 rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase">Run Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Trades Approved', value: String(runSummary.approved) },
              { label: 'Skipped', value: String(runSummary.skipped) },
              { label: 'Cash Deployed', value: fmt(runSummary.deployed) },
              { label: 'Cash Remaining', value: fmt(runSummary.remaining) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-black/40 rounded p-3 border border-white/5">
                <div className="text-white/30 text-[10px] font-mono uppercase mb-1">{label}</div>
                <div className="text-white font-mono font-bold text-sm">{value}</div>
              </div>
            ))}
          </div>
          <div className="text-xs font-mono text-white/30 border-t border-white/10 pt-3">
            Projected value if all targets hit: <span className="text-[#AAFF00]">{fmt(runSummary.projected)}</span>
          </div>
        </div>
      )}

      {/* Two-column: watchlist + decision log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Watchlist */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-5">
          <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase mb-4 flex items-center gap-2">
            <Zap size={12} />
            Watchlist — Top 10
          </h2>
          {watchlistLoading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />)}</div>
          ) : (
            <div className="space-y-1">
              {Array.from(watchlist.entries()).map(([sym, { quote, history }]) => {
                const positive = quote.changePercent >= 0;
                const isHeld = portfolio?.positions.some(p => p.symbol === sym);
                return (
                  <div key={sym} className={clsx('flex items-center gap-3 px-2 py-2 rounded transition-colors', isHeld ? 'bg-[#AAFF00]/5' : 'hover:bg-white/[0.03]')}>
                    <div className="font-mono font-bold text-white text-sm w-12 flex-shrink-0">{sym}</div>
                    {isHeld && <span className="text-[#AAFF00] text-[9px] font-mono font-bold px-1.5 py-0.5 bg-[#AAFF00]/10 rounded flex-shrink-0">HELD</span>}
                    <div className="flex-1 min-w-0">
                      {history.length > 0 && <MiniChart data={history} positive={positive} height={32} />}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-white text-sm">${quote.price.toFixed(2)}</div>
                      <div className={clsx('text-[10px] font-mono flex items-center justify-end gap-0.5', positive ? 'text-[#AAFF00]' : 'text-red-400')}>
                        {positive ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                        {positive ? '+' : ''}{quote.changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Decision Log */}
        <div className="bg-[#111] border border-white/10 rounded-lg">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase flex items-center gap-2">
              <Bot size={12} />
              Decision Log
            </h2>
            <span className="text-white/30 text-xs font-mono">{decisionLog.length} trades</span>
          </div>
          {decisionLog.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Bot size={28} className="text-white/10 mx-auto mb-3" />
              <div className="text-white/20 text-sm font-mono">No trades yet</div>
              <div className="text-white/10 text-xs font-mono mt-1">Run analysis and approve a trade to begin</div>
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
              {decisionLog.map((log, i) => (
                <div key={i}>
                  <button
                    className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"
                    onClick={() => setExpandedRows(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                  >
                    <span className={clsx('w-14 text-center text-xs font-mono font-bold py-1 px-2 rounded flex-shrink-0', log.action === 'BUY' ? 'bg-[#AAFF00]/20 text-[#AAFF00] border border-[#AAFF00]/20' : 'bg-red-500/20 text-red-400 border border-red-500/20')}>
                      {log.action}
                    </span>
                    <span className="font-mono font-bold text-white w-16 flex-shrink-0">{log.symbol}</span>
                    <span className="text-white/40 text-xs font-mono hidden sm:block">{log.shares} shares @ ${log.price.toFixed(2)}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[#AAFF00] text-xs font-mono flex items-center gap-1">
                        <CheckCircle size={10} /> Executed
                      </span>
                      {expandedRows.has(i) ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />}
                    </div>
                  </button>
                  {expandedRows.has(i) && (
                    <div className="px-5 pb-4 bg-white/[0.01]">
                      <div className="text-white/40 text-xs font-mono">{new Date(log.timestamp).toLocaleString()}</div>
                      <div className="text-white/50 text-xs font-mono mt-1">Total: {fmt(log.shares * log.price)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Approval Overlay */}
      {overlayOpen && result && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

            {/* Overlay header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne)' }}>
                  AI Recommendations
                </h2>
                <p className="text-white/40 text-xs font-mono mt-1">
                  Available cash: <span className="text-[#AAFF00] font-bold">{fmt(overlayCash)}</span>
                  {result.mode === 'demo' && <span className="ml-3 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded text-[10px]">DEMO MODE</span>}
                </p>
              </div>
              <button onClick={closeOverlay} className="text-white/40 hover:text-white transition-colors p-2">
                <X size={20} />
              </button>
            </div>

            {/* Market summary card */}
            <div className="bg-[#111] border border-[#AAFF00]/20 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono text-white/40 uppercase tracking-widest">Market Summary</div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-white/30">Health: <span className="text-[#AAFF00]">{result.portfolioHealthScore}</span></span>
                  <span className="text-xs font-mono text-white/30">Projection: <span className="text-[#AAFF00]">{result.monthlyReturnProjection}</span></span>
                </div>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">{result.marketSummary}</p>
            </div>

            {/* Approve all / skip all */}
            <div className="flex gap-3 items-center">
              <button
                onClick={approveAll}
                className="px-6 py-2.5 bg-[#AAFF00] text-black font-mono font-bold text-sm rounded hover:bg-[#AAFF00]/90 transition-all"
              >
                APPROVE ALL
              </button>
              <button
                onClick={skipAll}
                className="px-6 py-2.5 border border-white/20 text-white/60 font-mono font-bold text-sm rounded hover:border-white/40 hover:text-white transition-all"
              >
                SKIP ALL
              </button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs font-mono text-white/30">
                  {Object.values(approvedMap).filter(Boolean).length}/{result.recommendations.length} approved
                </span>
                <button
                  onClick={closeOverlay}
                  className="px-6 py-2.5 border border-white/10 text-white/30 font-mono text-sm rounded hover:border-white/20 hover:text-white/50 transition-all"
                >
                  Done
                </button>
              </div>
            </div>

            {/* Recommendation cards */}
            <div className="space-y-4">
              {result.recommendations.map((rec, i) => {
                const isApproved = approvedMap[i];
                const isApproving = approvingMap[i];
                const isSkipped = skippedMap[i];
                const totalCost = rec.shares * rec.buy_at_price;

                return (
                  <div
                    key={i}
                    className={clsx(
                      'bg-[#111] border rounded-lg p-5 space-y-4 transition-all',
                      isApproved ? 'border-[#AAFF00]/40' : isSkipped ? 'border-white/5 opacity-40' : 'border-white/10'
                    )}
                  >
                    {/* Top row */}
                    <div className="flex items-start gap-4">
                      <div>
                        <div className="font-mono font-bold text-4xl text-[#AAFF00]">{rec.symbol}</div>
                        <div className="text-white/40 text-xs font-mono mt-0.5">{COMPANY_NAMES[rec.symbol] ?? rec.symbol}</div>
                      </div>
                      <div className="flex flex-col gap-1.5 ml-auto items-end">
                        <span className={clsx('px-3 py-1 text-xs font-mono font-bold rounded', rec.action === 'BUY' ? 'bg-[#AAFF00] text-black' : 'bg-red-500 text-white')}>
                          {rec.action}
                        </span>
                        <span className={clsx('px-2 py-0.5 text-[10px] font-mono border rounded', riskBg(rec.risk_level))}>
                          {rec.risk_level} RISK
                        </span>
                      </div>
                    </div>

                    {/* Price ladder */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-black/40 border border-white/5 rounded p-3">
                        <div className="text-white/30 text-[10px] font-mono uppercase mb-1">Entry</div>
                        <div className="font-mono font-bold text-blue-400">${rec.buy_at_price.toFixed(2)}</div>
                      </div>
                      <div className="bg-black/40 border border-white/5 rounded p-3">
                        <div className="text-white/30 text-[10px] font-mono uppercase mb-1">Target</div>
                        <div className="font-mono font-bold text-[#AAFF00]">${rec.sell_target_price.toFixed(2)} ↑</div>
                      </div>
                      <div className="bg-black/40 border border-white/5 rounded p-3">
                        <div className="text-white/30 text-[10px] font-mono uppercase mb-1">Stop</div>
                        <div className="font-mono font-bold text-red-400">${rec.stop_loss_price.toFixed(2)} ↓</div>
                      </div>
                    </div>

                    {/* Shares + cost */}
                    <div className="text-sm font-mono text-white/60">
                      <span className="text-white">{rec.shares}</span> shares &times; <span className="text-white">${rec.buy_at_price.toFixed(2)}</span> = <span className="text-[#AAFF00] font-bold">{fmt(totalCost)}</span>
                      <span className="ml-4 text-white/30">Est. profit: <span className="text-[#AAFF00]">{rec.estimated_profit}</span> &nbsp; Est. loss: <span className="text-red-400">{rec.estimated_loss}</span></span>
                    </div>

                    {/* Confidence bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-white/30 uppercase">Confidence</span>
                        <span className={clsx('text-xs font-mono font-bold', riskColor(rec.risk_level))}>{(rec.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-[#AAFF00] rounded-full transition-all" style={{ width: `${rec.confidence * 100}%` }} />
                      </div>
                    </div>

                    {/* Timeframe */}
                    <div className="text-[10px] font-mono text-white/30">
                      Timeframe: <span className="text-white/50">{rec.expected_timeframe}</span>
                    </div>

                    {/* Reasoning */}
                    <p className="text-white/60 text-sm leading-relaxed pl-3 border-l border-white/10">
                      {rec.reasoning}
                    </p>

                    {/* Key signals */}
                    {rec.key_signals.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rec.key_signals.map((sig, j) => (
                          <span key={j} className="px-2 py-0.5 bg-[#AAFF00]/10 border border-[#AAFF00]/20 rounded text-[#AAFF00] text-xs font-mono">
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    {isApproved ? (
                      <div className="flex items-center gap-2 text-[#AAFF00] text-sm font-mono font-bold">
                        <CheckCircle size={16} />
                        Trade Executed
                      </div>
                    ) : isSkipped ? (
                      <div className="text-white/30 text-sm font-mono">Skipped</div>
                    ) : (
                      <div className="flex gap-3 items-center">
                        <button
                          onClick={() => approveTrade(rec, i)}
                          disabled={isApproving}
                          className="px-5 py-2 bg-[#AAFF00] text-black font-mono font-bold text-sm rounded hover:bg-[#AAFF00]/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isApproving ? (
                            <>
                              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Executing...
                            </>
                          ) : 'APPROVE'}
                        </button>
                        <button
                          onClick={() => skipTrade(i)}
                          className="px-5 py-2 border border-white/20 text-white/50 font-mono text-sm rounded hover:border-white/40 hover:text-white/70 transition-all"
                        >
                          SKIP
                        </button>
                        <span className="text-white/20 text-xs font-mono ml-auto">{fmt(totalCost)} required</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Do not touch */}
            {result.doNotTouch.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                <div className="text-red-400/80 text-xs font-mono uppercase tracking-widest mb-2">Do Not Touch</div>
                <div className="space-y-1">
                  {result.doNotTouchReasons.map((reason, i) => (
                    <div key={i} className="text-white/40 text-xs font-mono">{reason}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
