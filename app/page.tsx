'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import StatCard from '@/components/ui/StatCard';
import PortfolioChart from '@/components/charts/PortfolioChart';
import MarketOverview from '@/components/MarketOverview';
import { TrendingUp, TrendingDown, RefreshCw, Activity, Zap, BarChart2, Bell, Shield, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { PortfolioStats, Position } from '@/types';
import { loadPortfolio, computeTotalValue, type StoredTrade } from '@/lib/portfolioStore';

const CHALLENGE_KEY = 'alphabot_challenge_start';
const CHALLENGE_DAYS = 30;

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AutopilotState {
  isEnabled: boolean;
  activatedAt: string | null;
  defensiveMode: boolean;
  defensiveModeReason: string | null;
  consecutiveLosses: number;
  peakPortfolioValue: number;
}

interface ActivityEntry {
  id: string;
  event_type: string;
  message: string;
  symbol: string | null;
  timestamp: string;
}

function EventEmoji(type: string): string {
  const map: Record<string, string> = {
    SCAN_START: '🔍', ANALYSIS: '📊', AI_ANALYSIS: '🤖',
    BUY: '🟢', SELL: '🔴', SKIP: '💤', NO_TRADES: '💤',
    MONITOR: '👁️', MONITOR_CHECK: '👁️', TARGET_HIT: '🎯',
    STOP_LOSS: '🔴', TIME_STOP: '⏰', DEFENSIVE_MODE: '🛡️',
    MARKET_ALERT: '⚠️',
  };
  return map[type] ?? '•';
}

function ActivityLog() {
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const r = await fetch('/api/activity-log?limit=60');
      const d = await r.json();
      setLogs(d.logs ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchLogs();
    const i = setInterval(fetchLogs, 30000);
    return () => clearInterval(i);
  }, [fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function typeColor(type: string): string {
    if (type === 'BUY' || type === 'TARGET_HIT') return 'text-[#AAFF00]';
    if (type === 'SELL' || type === 'STOP_LOSS') return 'text-red-400';
    if (type === 'SKIP' || type === 'NO_TRADES') return 'text-yellow-400/70';
    if (type === 'MONITOR' || type === 'MONITOR_CHECK') return 'text-blue-400/70';
    if (type === 'DEFENSIVE_MODE' || type === 'MARKET_ALERT') return 'text-orange-400';
    return 'text-white/50';
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return (
    <div className="bg-[#111] border border-white/10 rounded-lg">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-xs font-mono text-white/60 tracking-widest uppercase flex items-center gap-2">
          <Activity size={12} />
          Bot Activity Log
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#AAFF00] animate-pulse" />
          <span className="text-[#AAFF00] text-[10px] font-mono">LIVE</span>
        </div>
      </div>

      <div className="p-3 h-56 overflow-y-auto font-mono text-xs space-y-0.5 bg-black/30">
        {loading ? (
          <div className="text-white/20 text-center py-4">Loading activity...</div>
        ) : logs.length === 0 ? (
          <div className="text-white/20 text-center py-8">
            No activity yet — activate Autopilot Mode to see the bot in action
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id ?? i} className={clsx('flex items-start gap-2 py-0.5', typeColor(log.event_type))}>
              <span className="text-white/20 flex-shrink-0 w-14">[{formatTime(log.timestamp)}]</span>
              <span className="leading-relaxed">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function AutopilotToggle({ onChange }: { onChange?: (on: boolean) => void }) {
  const [state, setState] = useState<AutopilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch('/api/autopilot');
      const d = await r.json();
      setState(d);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  async function activate() {
    setSaving(true);
    try {
      const r = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: true }),
      });
      const d = await r.json();
      setState(d);
      onChange?.(true);
    } catch { /* silent */ }
    finally { setSaving(false); setShowConfirmModal(false); }
  }

  async function deactivate() {
    setSaving(true);
    try {
      const r = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: false }),
      });
      const d = await r.json();
      setState(d);
      onChange?.(false);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  const isOn = state?.isEnabled ?? false;

  return (
    <>
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/20 rounded-xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-syne)' }}>
                  Activate Autopilot?
                </h3>
                <p className="text-white/40 text-xs font-mono mt-1">Full autonomous trading mode</p>
              </div>
              <button onClick={() => setShowConfirmModal(false)} className="text-white/30 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <p className="text-yellow-400 text-sm font-mono leading-relaxed">
                Autopilot will trade your <span className="font-bold">$4,000 portfolio</span> automatically. It will buy and sell without asking you first. Are you sure?
              </p>
            </div>

            <div className="space-y-2 text-xs font-mono text-white/40">
              <div className="flex items-center gap-2"><span className="text-[#AAFF00]">✓</span> Runs analysis 6× per day on market days</div>
              <div className="flex items-center gap-2"><span className="text-[#AAFF00]">✓</span> Monitors exits every 15 minutes</div>
              <div className="flex items-center gap-2"><span className="text-[#AAFF00]">✓</span> Sends alerts for every trade</div>
              <div className="flex items-center gap-2"><span className="text-[#AAFF00]">✓</span> Auto-defensive mode if drawdown &gt; 8%</div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={activate}
                disabled={saving}
                className="flex-1 py-3 bg-green-500 text-black font-mono font-bold text-sm rounded-lg hover:bg-green-400 transition-all disabled:opacity-50"
              >
                {saving ? 'Activating...' : 'ACTIVATE AUTOPILOT'}
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-3 border border-white/20 text-white/50 font-mono text-sm rounded-lg hover:text-white transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Card */}
      <div className={clsx(
        'rounded-xl border p-5 transition-all',
        isOn ? 'bg-green-500/5 border-green-500/30' : 'bg-[#111] border-white/10'
      )}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={clsx(
              'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
              isOn ? 'bg-green-500/20' : 'bg-white/5'
            )}>
              <Zap size={22} className={isOn ? 'text-green-400' : 'text-white/30'} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-white font-bold text-base" style={{ fontFamily: 'var(--font-syne)' }}>
                  AUTOPILOT MODE
                </h2>
                {isOn && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/20 border border-green-500/40 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-[9px] font-mono font-bold tracking-wider">ACTIVE</span>
                  </span>
                )}
                {state?.defensiveMode && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/20 border border-orange-500/40 rounded-full">
                    <Shield size={9} className="text-orange-400" />
                    <span className="text-orange-400 text-[9px] font-mono font-bold">DEFENSIVE</span>
                  </span>
                )}
              </div>
              <p className="text-white/40 text-xs font-mono mt-0.5">
                {loading ? '...' : isOn
                  ? `Trading autonomously since ${state?.activatedAt ? new Date(state.activatedAt).toLocaleDateString() : 'today'}`
                  : 'Bot runs itself 24/7 — no manual approval required'}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={() => {
              if (!isOn) setShowConfirmModal(true);
              else deactivate();
            }}
            disabled={loading || saving}
            className={clsx(
              'relative w-14 h-7 rounded-full transition-all duration-300 flex-shrink-0 disabled:opacity-50',
              isOn ? 'bg-green-500' : 'bg-white/10 border border-white/20'
            )}
          >
            <span className={clsx(
              'absolute top-1 w-5 h-5 rounded-full transition-all duration-300 shadow-md',
              isOn ? 'left-8 bg-white' : 'left-1 bg-white/40'
            )} />
          </button>
        </div>

        {/* Defensive mode reason */}
        {state?.defensiveMode && state.defensiveModeReason && (
          <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-orange-400 text-xs font-mono">
              <Shield size={12} />
              <span className="font-bold">DEFENSIVE MODE:</span>
              <span className="text-orange-400/80">{state.defensiveModeReason}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ChallengeSection({ stats }: { stats: PortfolioStats | null }) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [tradeCount, setTradeCount] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(CHALLENGE_KEY);
    if (stored) {
      setStartDate(new Date(stored));
    } else {
      const now = new Date();
      localStorage.setItem(CHALLENGE_KEY, now.toISOString());
      setStartDate(now);
    }
    const store = loadPortfolio();
    const sells = store.trades.filter((t: StoredTrade) => t.action === 'SELL');
    const buys = store.trades.filter((t: StoredTrade) => t.action === 'BUY');
    const w = sells.filter((sell: StoredTrade) => {
      const lastBuy = buys.find((b: StoredTrade) => b.symbol === sell.symbol);
      return lastBuy ? sell.price > lastBuy.price : false;
    }).length;
    setTradeCount(store.trades.length);
    setWins(w);
    setLosses(sells.length - w);
  }, []);

  if (!startDate) return null;

  const now = new Date();
  const msElapsed = now.getTime() - startDate.getTime();
  const dayElapsed = Math.max(1, Math.min(CHALLENGE_DAYS, Math.floor(msElapsed / (1000 * 60 * 60 * 24)) + 1));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + CHALLENGE_DAYS);

  const startValue = 4000;
  const currentValue = stats?.totalValue ?? startValue;
  const pnl = currentValue - startValue;
  const pnlPct = (pnl / startValue) * 100;

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const snapshotData = stats?.snapshots ?? [];

  return (
    <div className="bg-[#111] border border-white/10 rounded-lg p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-syne)' }}>30-DAY CHALLENGE</h2>
          <p className="text-white/30 text-xs font-mono mt-0.5">
            Started: {formatDate(startDate)} &nbsp;&middot;&nbsp; Ends: {formatDate(endDate)}
          </p>
        </div>
        <span className="px-3 py-1 bg-[#AAFF00] text-black text-xs font-mono font-bold rounded-full">
          Day {dayElapsed} of {CHALLENGE_DAYS}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-black/40 border border-white/5 rounded p-3">
          <div className="text-white/30 text-[10px] font-mono uppercase mb-1">Starting</div>
          <div className="font-mono font-bold text-white">{fmt(startValue)}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded p-3">
          <div className="text-white/30 text-[10px] font-mono uppercase mb-1">P&amp;L</div>
          <div className={clsx('font-mono font-bold', pnl >= 0 ? 'text-[#AAFF00]' : 'text-red-400')}>{fmt(pnl)}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded p-3">
          <div className="text-white/30 text-[10px] font-mono uppercase mb-1">Return</div>
          <div className={clsx('font-mono font-bold', pnlPct >= 0 ? 'text-[#AAFF00]' : 'text-red-400')}>{fmtPct(pnlPct)}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded p-3">
          <div className="text-white/30 text-[10px] font-mono uppercase mb-1">Win/Loss</div>
          <div className="font-mono font-bold text-white">{wins}W / {losses}L</div>
        </div>
      </div>

      {snapshotData.length > 1 ? (
        <PortfolioChart snapshots={snapshotData} startValue={startValue} />
      ) : (
        <div className="h-24 flex items-center justify-center border border-white/5 rounded bg-black/20">
          <span className="text-white/20 text-xs font-mono">Portfolio chart will appear after first bot run</span>
        </div>
      )}

      <div className="flex items-center gap-6 mt-3 text-xs font-mono text-white/30">
        <span>Bot Accuracy: <span className="text-white/50">{wins + losses > 0 ? `${((wins / (wins + losses)) * 100).toFixed(0)}%` : '—%'}</span></span>
        <span>Trades: <span className="text-white/50">{tradeCount}</span></span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'market'>('overview');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [autopilotOn, setAutopilotOn] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setRefreshing(true);
      const store = loadPortfolio();
      let livePrices: Record<string, number> = {};
      try {
        const symbols = store.positions.map(p => p.symbol).join(',');
        if (symbols) {
          const priceRes = await fetch(`/api/market/quotes?symbols=${symbols}`);
          const priceData = await priceRes.json();
          for (const [sym, q] of Object.entries(priceData.quotes ?? {})) {
            livePrices[sym] = (q as { price: number }).price;
          }
        }
      } catch { /* silent */ }

      const totalValue = computeTotalValue(store, livePrices);
      const startValue = 4000;
      const totalPnl = totalValue - startValue;

      const enrichedPositions = store.positions.map(p => {
        const currentPrice = livePrices[p.symbol] ?? p.avg_cost_basis;
        return {
          id: p.symbol,
          symbol: p.symbol,
          shares: p.shares,
          avg_cost_basis: p.avg_cost_basis,
          current_price: currentPrice,
          unrealized_pnl: (currentPrice - p.avg_cost_basis) * p.shares,
          unrealized_pnl_pct: ((currentPrice - p.avg_cost_basis) / p.avg_cost_basis) * 100,
          portfolio_id: 'local',
          sell_target: store.trades.find(t => t.action === 'BUY' && t.symbol === p.symbol)?.sell_target ?? null,
          stop_loss: store.trades.find(t => t.action === 'BUY' && t.symbol === p.symbol)?.stop_loss ?? null,
          bought_at: p.bought_at,
        };
      });

      const snaps = store.snapshots;
      const yesterday = snaps.length > 1 ? snaps[snaps.length - 2].totalValue : null;
      const todayPnl = yesterday ? totalValue - yesterday : 0;
      const todayPnlPct = yesterday ? (todayPnl / yesterday) * 100 : 0;

      const sells = store.trades.filter(t => t.action === 'SELL');
      const buys = store.trades.filter(t => t.action === 'BUY');
      const winRate = sells.length > 0
        ? (sells.filter(sell => {
            const lastBuy = buys.find(b => b.symbol === sell.symbol);
            return lastBuy ? sell.price > lastBuy.price : false;
          }).length / sells.length) * 100
        : 0;

      setStats({
        totalValue,
        cashBalance: store.cash,
        positionsValue: totalValue - store.cash,
        totalPnl,
        totalPnlPct: (totalPnl / startValue) * 100,
        todayPnl,
        todayPnlPct,
        winRate,
        positions: enrichedPositions as unknown as Position[],
        snapshots: store.snapshots.map(s => ({ id: '', portfolio_id: 'local', timestamp: s.timestamp, total_value: s.totalValue })),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Fetch unread alerts count
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const r = await fetch('/api/alerts?unread=true&limit=1');
        const d = await r.json();
        setUnreadAlerts(d.unreadCount ?? 0);
      } catch { /* silent */ }
    };
    fetchUnread();
    const i = setInterval(fetchUnread, 30000);
    return () => clearInterval(i);
  }, []);

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
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  function daysHeld(boughtAt: string | undefined | null): number {
    if (!boughtAt) return 0;
    const diff = Date.now() - new Date(boughtAt).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="p-5 space-y-5 grid-bg min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne)' }}>
            Portfolio Dashboard
          </h1>
          <p className="text-white/40 text-xs font-mono mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            &nbsp;&middot;&nbsp;Paper Trading Simulation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Alerts bell */}
          <a href="/alerts" className="relative p-2.5 rounded-lg border border-white/10 text-white/40 hover:text-white transition-all">
            <Bell size={16} />
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[8px] font-bold rounded-full px-1">
                {unreadAlerts > 99 ? '99+' : unreadAlerts}
              </span>
            )}
          </a>

          <button
            onClick={fetchStats}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 text-white/50 hover:text-white hover:border-[#AAFF00]/30 text-sm transition-all"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Autopilot Toggle — prominent at top */}
      <AutopilotToggle onChange={setAutopilotOn} />

      {error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 text-yellow-400/80 text-xs font-mono flex items-center gap-2">
          <Activity size={12} />
          No API keys configured — displaying simulated market data. Add keys in Settings to enable live data.
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Value"
          value={stats ? fmt(stats.totalValue) : '$4,000.00'}
          sub={stats ? `Cash: ${fmt(stats.cashBalance)}` : 'Starting balance'}
          accent
          loading={loading}
        />
        <StatCard
          label="All-Time P&L"
          value={stats ? fmt(stats.totalPnl) : '$0.00'}
          sub={stats ? fmtPct(stats.totalPnlPct) : '+0.00%'}
          positive={stats ? stats.totalPnl >= 0 : undefined}
          negative={stats ? stats.totalPnl < 0 : undefined}
          loading={loading}
        />
        <StatCard
          label="Today P&L"
          value={stats ? fmt(stats.todayPnl) : '$0.00'}
          sub={stats ? fmtPct(stats.todayPnlPct) : '+0.00%'}
          positive={stats ? stats.todayPnl >= 0 : undefined}
          negative={stats ? stats.todayPnl < 0 : undefined}
          loading={loading}
        />
        <StatCard
          label="Win Rate"
          value={stats ? `${stats.winRate.toFixed(1)}%` : '0.0%'}
          sub={`${stats?.positions.length ?? 0} open positions`}
          loading={loading}
        />
      </div>

      {/* 30-Day Challenge */}
      <ChallengeSection stats={stats} />

      {/* Tab Switch */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {([
          { id: 'overview', label: 'Portfolio Overview', icon: BarChart2 },
          { id: 'market', label: 'Live Market', icon: Activity },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-mono border-b-2 -mb-px transition-all',
              tab === id
                ? 'border-[#AAFF00] text-[#AAFF00]'
                : 'border-transparent text-white/40 hover:text-white'
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          {/* Portfolio chart */}
          <div className="bg-[#111111] border border-white/10 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-mono text-white/60 tracking-widest uppercase">Portfolio Value — 30 Days</h2>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#AAFF00] animate-pulse" />
                <span className="text-[#AAFF00] text-xs font-mono">LIVE</span>
              </div>
            </div>
            {loading ? (
              <div className="h-56 bg-white/5 rounded animate-pulse" />
            ) : stats && stats.snapshots.length > 1 ? (
              <PortfolioChart snapshots={stats.snapshots} startValue={4000} />
            ) : (
              <div className="h-56 flex flex-col items-center justify-center gap-3 text-white/20 text-sm font-mono">
                <Zap size={24} className="text-[#AAFF00]/30" />
                Run AlphaBot to start generating portfolio history
              </div>
            )}
          </div>

          {/* Active Positions — enhanced with stop/target distance */}
          <div className="bg-[#111111] border border-white/10 rounded-lg">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xs font-mono text-white/60 tracking-widest uppercase">Active Positions</h2>
              <span className="text-white/30 text-xs font-mono">{stats?.positions.length ?? 0} holdings</span>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />)}
              </div>
            ) : stats && stats.positions.length > 0 ? (
              <div className="space-y-0 divide-y divide-white/5">
                {stats.positions.map((pos: Position & { sell_target?: number | null; stop_loss?: number | null; bought_at?: string | null }) => {
                  const pnl = pos.unrealized_pnl ?? 0;
                  const pnlPct = pos.unrealized_pnl_pct ?? 0;
                  const positive = pnl >= 0;
                  const cp = pos.current_price ?? 0;
                  const target = pos.sell_target;
                  const stop = pos.stop_loss;
                  const days = daysHeld(pos.bought_at);

                  const distToTarget = target ? ((target - cp) / cp) * 100 : null;
                  const distToStop = stop ? ((cp - stop) / cp) * 100 : null;

                  // Progress to target (0-100%)
                  const entryToTarget = (target && stop) ? target - pos.avg_cost_basis : null;
                  const currentProgress = (target && stop && entryToTarget) ? Math.max(0, Math.min(100, ((cp - pos.avg_cost_basis) / entryToTarget) * 100)) : null;

                  return (
                    <div key={pos.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-mono font-bold text-[#AAFF00] text-base">{pos.symbol}</span>
                            <div className="text-white/30 text-[10px] font-mono mt-0.5">{Number(pos.shares).toFixed(2)} shares · {days}d held</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-white">${cp.toFixed(2)}</div>
                          <div className={clsx('text-xs font-mono flex items-center justify-end gap-0.5', positive ? 'text-[#AAFF00]' : 'text-red-400')}>
                            {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {positive ? '+' : ''}${pnl.toFixed(2)} ({positive ? '+' : ''}{pnlPct.toFixed(2)}%)
                          </div>
                        </div>
                      </div>

                      {/* Stop / Target distance bars */}
                      {(target || stop) && (
                        <div className="mt-3 space-y-2">
                          {target && distToTarget !== null && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-mono">
                                <span className="text-white/30">Target: ${target.toFixed(2)}</span>
                                <span className={distToTarget <= 1 ? 'text-[#AAFF00] font-bold' : 'text-[#AAFF00]/60'}>{distToTarget >= 0 ? '+' : ''}{distToTarget.toFixed(1)}% away</span>
                              </div>
                              {currentProgress !== null && (
                                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#AAFF00] rounded-full transition-all" style={{ width: `${Math.max(0, currentProgress)}%` }} />
                                </div>
                              )}
                            </div>
                          )}
                          {stop && distToStop !== null && (
                            <div className="flex items-center justify-between text-[9px] font-mono">
                              <span className="text-white/30">Stop: ${stop.toFixed(2)}</span>
                              <span className={distToStop <= 2 ? 'text-red-400 font-bold' : 'text-white/30'}>{distToStop.toFixed(1)}% buffer</span>
                            </div>
                          )}
                          {days >= 4 && (
                            <div className="text-[9px] font-mono text-yellow-400/70">
                              ⏰ {5 - days <= 0 ? 'Time stop due!' : `Time stop in ${5 - days} trading day${5 - days !== 1 ? 's' : ''}`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-12 text-center space-y-2">
                <div className="text-white/20 text-sm font-mono">No active positions</div>
                <div className="text-white/10 text-xs font-mono">Navigate to AlphaBot and run the agent to begin paper trading</div>
              </div>
            )}
          </div>

          {/* Bot Activity Log */}
          <ActivityLog />
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono text-white/60 tracking-widest uppercase">Watchlist — 20 Stocks</h2>
            <span className="text-[10px] font-mono text-white/30">Click any card to inspect · Auto-refreshes every 60s</span>
          </div>
          <MarketOverview />
        </div>
      )}

      {/* AlphaBot status card */}
      <div className={clsx(
        'rounded-lg p-4 flex items-center justify-between',
        autopilotOn ? 'bg-green-500/5 border border-green-500/20' : 'bg-[#111] border border-[#AAFF00]/20'
      )}>
        <div className="flex items-center gap-3">
          <div className={clsx('w-8 h-8 rounded flex items-center justify-center', autopilotOn ? 'bg-green-500/20' : 'bg-[#AAFF00]/10')}>
            <Zap size={14} className={autopilotOn ? 'text-green-400' : 'text-[#AAFF00]'} />
          </div>
          <div>
            <div className="text-white text-sm font-mono font-bold">AlphaBot Status</div>
            <div className={clsx('text-xs font-mono', autopilotOn ? 'text-green-400' : 'text-white/40')}>
              {autopilotOn ? '● Running autonomously — next run at scheduled market session' : 'Idle — waiting for next analysis cycle'}
            </div>
          </div>
        </div>
        <a
          href="/bot"
          className={clsx(
            'px-4 py-2 text-xs font-mono font-bold rounded hover:opacity-90 transition-all',
            autopilotOn ? 'bg-green-500 text-black' : 'bg-[#AAFF00] text-black'
          )}
        >
          {autopilotOn ? 'VIEW BOT →' : 'LAUNCH BOT →'}
        </a>
      </div>
    </div>
  );
}
