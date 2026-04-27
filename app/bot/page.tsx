'use client';

import { useState, useCallback, useEffect } from 'react';
import { Bot, Play, Square, Zap, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import MiniChart from '@/components/charts/MiniChart';
import type { BotDecisionLog, StockQuote, OHLCVBar } from '@/types';
import { DEFAULT_WATCHLIST } from '@/lib/constants';

const STEPS = [
  { id: 1, label: 'Fetching real-time quotes for 20 watchlist stocks' },
  { id: 2, label: 'Computing RSI, MACD, Bollinger Bands, SMA indicators' },
  { id: 3, label: 'Claude AI analyzing signals and generating decisions' },
  { id: 4, label: 'Validating trades against risk rules (20% max, 15% drawdown)' },
  { id: 5, label: 'Executing paper trades and updating portfolio' },
];

interface WatchlistItem {
  quote: StockQuote;
  history: OHLCVBar[];
}

export default function BotPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [decisionLog, setDecisionLog] = useState<BotDecisionLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Map<string, WatchlistItem>>(new Map());
  const [watchlistLoading, setWatchlistLoading] = useState(true);

  // Load watchlist market data
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

  const runBot = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setCurrentStep(1);

    const stepTimers: NodeJS.Timeout[] = [];
    STEPS.forEach((_, i) => {
      const t = setTimeout(() => setCurrentStep(i + 2), i * 1200);
      stepTimers.push(t);
    });

    try {
      const res = await fetch('/api/bot/run', { method: 'POST' });
      stepTimers.forEach(t => clearTimeout(t));
      setCurrentStep(5);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Bot run failed');
      }

      const data = await res.json();
      setDecisionLog(prev => [...(data.decisionLog ?? []), ...prev]);
      setLastRunTime(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bot run failed');
      stepTimers.forEach(t => clearTimeout(t));
    } finally {
      setIsRunning(false);
      setCurrentStep(0);
    }
  }, []);

  const toggleRow = (i: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const buys = decisionLog.filter(d => d.decision.action === 'BUY' && d.executed).length;
  const sells = decisionLog.filter(d => d.decision.action === 'SELL' && d.executed).length;
  const avgConfidence = decisionLog.length > 0
    ? (decisionLog.reduce((acc, d) => acc + d.decision.confidence, 0) / decisionLog.length * 100).toFixed(0)
    : '—';

  return (
    <div className="p-5 space-y-5 grid-bg min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3" style={{ fontFamily: 'var(--font-syne)' }}>
            <div className={clsx('w-3 h-3 rounded-full flex-shrink-0', isRunning ? 'bg-[#AAFF00] bot-running' : 'bg-white/20')} />
            AlphaBot AI Agent
          </h1>
          <p className="text-white/40 text-xs font-mono mt-0.5">
            {isRunning
              ? `Step ${currentStep}/5 — ${STEPS[currentStep - 1]?.label ?? 'Processing...'}`
              : lastRunTime
              ? `Last run at ${lastRunTime} · ${decisionLog.length} decisions made`
              : 'Idle — Ready to analyze 20 stocks and generate trade decisions'}
          </p>
        </div>
        <button
          onClick={runBot}
          disabled={isRunning}
          className={clsx(
            'flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-sm font-bold transition-all',
            isRunning
              ? 'bg-red-500/20 border border-red-500/40 text-red-400 cursor-not-allowed'
              : 'bg-[#AAFF00] text-black hover:bg-[#AAFF00]/80 shadow-[0_0_20px_rgba(170,255,0,0.3)]'
          )}
        >
          {isRunning ? <><Square size={14} /> Running...</> : <><Play size={14} fill="black" /> Run Analysis</>}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm font-mono flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
          {error.toLowerCase().includes('api') && (
            <span className="text-red-400/60 text-xs ml-1">— Add your API keys in Settings to enable full functionality</span>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Status', value: isRunning ? 'RUNNING' : 'IDLE', accent: isRunning },
          { label: 'Total Decisions', value: String(decisionLog.length), accent: false },
          { label: 'Buys / Sells', value: `${buys} / ${sells}`, accent: false },
          { label: 'Avg Confidence', value: avgConfidence === '—' ? '—' : `${avgConfidence}%`, accent: false },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-[#111] border border-white/10 rounded-lg p-4">
            <div className="text-white/40 text-[10px] font-mono tracking-widest uppercase mb-1">{label}</div>
            <div className={clsx('text-xl font-mono font-bold', accent ? 'text-[#AAFF00]' : 'text-white')}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Two-column layout: pipeline + watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Agent Pipeline */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-5">
          <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase mb-4 flex items-center gap-2">
            <Bot size={12} />
            Agent Pipeline
          </h2>
          <div className="space-y-2.5">
            {STEPS.map(step => {
              const done = currentStep > step.id;
              const active = currentStep === step.id;
              return (
                <div
                  key={step.id}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md border transition-all duration-300',
                    active ? 'border-[#AAFF00]/40 bg-[#AAFF00]/5' : done ? 'border-white/10 bg-white/[0.02]' : 'border-white/5'
                  )}
                >
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold flex-shrink-0',
                    active ? 'bg-[#AAFF00] text-black' : done ? 'bg-[#AAFF00]/20 text-[#AAFF00]' : 'bg-white/5 text-white/20'
                  )}>
                    {done ? <CheckCircle size={13} /> : step.id}
                  </div>
                  <span className={clsx('text-xs font-mono leading-relaxed', active ? 'text-[#AAFF00]' : done ? 'text-white/50' : 'text-white/20')}>
                    {step.label}
                  </span>
                  {active && (
                    <div className="ml-auto flex gap-1 flex-shrink-0">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 bg-[#AAFF00] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 text-xs font-mono text-white/30 space-y-1">
            <div>Model: claude-sonnet-4-20250514</div>
            <div>Max position: 20% of portfolio · Max drawdown: 15%</div>
            <div>Watchlist: {DEFAULT_WATCHLIST.length} stocks analyzed per run</div>
          </div>
        </div>

        {/* Live Watchlist Preview */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-5">
          <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase mb-4 flex items-center gap-2">
            <Zap size={12} />
            Watchlist — Top 10
          </h2>
          {watchlistLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from(watchlist.entries()).map(([sym, { quote, history }]) => {
                const positive = quote.changePercent >= 0;
                return (
                  <div key={sym} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-white/[0.03] transition-colors group">
                    <div className="font-mono font-bold text-white text-sm w-12 flex-shrink-0">{sym}</div>
                    <div className="flex-1 min-w-0">
                      {history.length > 0 && (
                        <MiniChart data={history} positive={positive} height={32} />
                      )}
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
      </div>

      {/* Decision Log */}
      <div className="bg-[#111] border border-white/10 rounded-lg">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xs font-mono text-white/60 tracking-widest uppercase flex items-center gap-2">
            <Bot size={12} />
            Decision Log
          </h2>
          <span className="text-white/30 text-xs font-mono">{decisionLog.length} decisions this session</span>
        </div>
        {decisionLog.length === 0 ? (
          <div className="px-5 py-16 text-center space-y-3">
            <Bot size={28} className="text-white/10 mx-auto" />
            <div className="text-white/20 text-sm font-mono">No decisions yet</div>
            <div className="text-white/10 text-xs font-mono">Click &quot;Run Analysis&quot; to start the AI agent</div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {decisionLog.map((log, i) => (
              <div key={i}>
                <button
                  className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"
                  onClick={() => toggleRow(i)}
                >
                  <span className={clsx(
                    'w-14 text-center text-xs font-mono font-bold py-1 px-2 rounded flex-shrink-0',
                    log.decision.action === 'BUY' ? 'bg-[#AAFF00]/20 text-[#AAFF00] border border-[#AAFF00]/20' :
                    log.decision.action === 'SELL' ? 'bg-red-500/20 text-red-400 border border-red-500/20' :
                    'bg-white/10 text-white/40 border border-white/10'
                  )}>
                    {log.decision.action}
                  </span>
                  <span className="font-mono font-bold text-white w-16 flex-shrink-0">{log.symbol}</span>
                  {log.decision.shares > 0 && (
                    <span className="text-white/40 text-xs font-mono hidden sm:block">
                      {log.decision.shares} shares @ ${log.indicators.price.toFixed(2)}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-white/30 text-xs font-mono hidden md:block">
                      {(log.decision.confidence * 100).toFixed(0)}% conf
                    </span>
                    <span className={clsx('text-xs font-mono flex items-center gap-1',
                      log.executed ? 'text-[#AAFF00]' : 'text-white/30'
                    )}>
                      {log.executed ? <CheckCircle size={10} /> : <Clock size={10} />}
                      {log.executed ? 'Executed' : 'Skipped'}
                    </span>
                    <span className="text-white/20 text-xs font-mono hidden sm:block">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {expandedRows.has(i) ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />}
                  </div>
                </button>
                {expandedRows.has(i) && (
                  <div className="px-5 pb-5 space-y-3 bg-white/[0.01]">
                    <div className="text-white/60 text-sm leading-relaxed border-l-2 border-[#AAFF00]/40 pl-4 py-1">
                      {log.decision.reasoning}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Confidence', value: `${(log.decision.confidence * 100).toFixed(0)}%`, color: 'text-white' },
                        { label: 'Risk Score', value: `${(log.decision.risk_score * 100).toFixed(0)}%`, color: log.decision.risk_score > 0.6 ? 'text-red-400' : 'text-[#AAFF00]' },
                        { label: 'Price Target', value: `$${log.decision.price_target?.toFixed(2) ?? 'N/A'}`, color: 'text-[#AAFF00]' },
                        { label: 'Stop Loss', value: `$${log.decision.stop_loss?.toFixed(2) ?? 'N/A'}`, color: 'text-red-400' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-black/40 rounded p-2.5 border border-white/5">
                          <div className="text-white/30 text-[10px] font-mono uppercase mb-1">{label}</div>
                          <div className={clsx('font-mono text-sm font-bold', color)}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {log.decision.key_signals?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {log.decision.key_signals.map((sig, j) => (
                          <span key={j} className="text-xs font-mono px-2 py-1 bg-white/5 border border-white/10 rounded text-white/40 flex items-center gap-1">
                            <Zap size={9} className="text-[#AAFF00]" />
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}
                    {log.decision.market_regime && (
                      <div className="text-[10px] font-mono text-white/30">
                        Market regime: <span className="text-white/50">{log.decision.market_regime}</span>
                      </div>
                    )}
                    {log.error && (
                      <div className="text-red-400/70 text-xs font-mono flex items-center gap-1">
                        <AlertCircle size={10} /> {log.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
