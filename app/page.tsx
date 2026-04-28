'use client';

import { useState, useEffect, useCallback } from 'react';
import StatCard from '@/components/ui/StatCard';
import PortfolioChart from '@/components/charts/PortfolioChart';
import MarketOverview from '@/components/MarketOverview';
import { TrendingUp, TrendingDown, RefreshCw, Activity, Zap, BarChart2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { PortfolioStats, Position } from '@/types';

const CHALLENGE_KEY = 'alphabot_challenge_start';
const CHALLENGE_DAYS = 30;

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ChallengeSection({ stats }: { stats: PortfolioStats | null }) {
  const [startDate, setStartDate] = useState<Date | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CHALLENGE_KEY);
    if (stored) {
      setStartDate(new Date(stored));
    } else {
      const now = new Date();
      localStorage.setItem(CHALLENGE_KEY, now.toISOString());
      setStartDate(now);
    }
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
    <div className="bg-[#111] border border-white/10 rounded-lg p-5 border-l-4 border-l-[#AAFF00]">
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
          <div className="font-mono font-bold text-white">0W / 0L</div>
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
        <span>Bot Accuracy: <span className="text-white/50">—%</span></span>
        <span>Trades: <span className="text-white/50">0</span></span>
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

  const fetchStats = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/portfolio');
      if (!res.ok) throw new Error('Failed to fetch portfolio');
      const data = await res.json();
      setStats(data.stats);
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

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

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
        <button
          onClick={fetchStats}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 text-white/50 hover:text-white hover:border-[#AAFF00]/30 text-sm transition-all"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

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

          {/* Active Positions */}
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Symbol', 'Shares', 'Avg Cost', 'Current', 'Value', 'P&L', 'P&L %'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-white/30 text-xs font-mono tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.positions.map((pos: Position) => {
                      const pnl = pos.unrealized_pnl ?? 0;
                      const pnlPct = pos.unrealized_pnl_pct ?? 0;
                      const positive = pnl >= 0;
                      return (
                        <tr key={pos.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-[#AAFF00]">{pos.symbol}</td>
                          <td className="px-4 py-3 font-mono text-white/70">{Number(pos.shares).toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono text-white/70">${Number(pos.avg_cost_basis).toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono text-white">${(pos.current_price ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono text-white">${((pos.current_price ?? 0) * Number(pos.shares)).toFixed(2)}</td>
                          <td className={clsx('px-4 py-3 font-mono', positive ? 'text-[#AAFF00]' : 'text-red-400')}>
                            {positive ? '+' : ''}${pnl.toFixed(2)}
                          </td>
                          <td className={clsx('px-4 py-3 font-mono text-xs', positive ? 'text-[#AAFF00]' : 'text-red-400')}>
                            <span className="flex items-center gap-1">
                              {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {positive ? '+' : ''}{pnlPct.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-12 text-center space-y-2">
                <div className="text-white/20 text-sm font-mono">No active positions</div>
                <div className="text-white/10 text-xs font-mono">Navigate to AlphaBot and run the agent to begin paper trading</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Live market grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono text-white/60 tracking-widest uppercase">Watchlist — 20 Stocks</h2>
              <span className="text-[10px] font-mono text-white/30">Click any card to inspect · Auto-refreshes every 60s</span>
            </div>
            <MarketOverview />
          </div>
        </>
      )}

      {/* AlphaBot status card */}
      <div className="bg-[#111] border border-[#AAFF00]/20 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#AAFF00]/10 flex items-center justify-center">
            <Zap size={14} className="text-[#AAFF00]" />
          </div>
          <div>
            <div className="text-white text-sm font-mono font-bold">AlphaBot Status</div>
            <div className="text-white/40 text-xs font-mono">Idle — waiting for next analysis cycle</div>
          </div>
        </div>
        <a
          href="/bot"
          className="px-4 py-2 bg-[#AAFF00] text-black text-xs font-mono font-bold rounded hover:bg-[#AAFF00]/90 transition-all"
        >
          LAUNCH BOT →
        </a>
      </div>
    </div>
  );
}
