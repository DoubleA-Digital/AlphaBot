'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import PieChart from '@/components/charts/PieChart';
import type { PortfolioStats, Trade } from '@/types';

export default function PortfolioPage() {
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const [portRes, tradesRes] = await Promise.all([
        fetch('/api/portfolio'),
        fetch('/api/trades/history').catch(() => null),
      ]);

      if (portRes.ok) {
        const data = await portRes.json();
        setStats(data.stats);
      }

      if (tradesRes?.ok) {
        const tData = await tradesRes.json();
        setTrades(tData.trades ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pieData = stats?.positions.map(pos => ({
    name: pos.symbol,
    value: (pos.current_price ?? pos.avg_cost_basis) * Number(pos.shares),
  })) ?? [];

  if (stats?.cashBalance) {
    pieData.push({ name: 'Cash', value: stats.cashBalance });
  }

  const formatCurrency = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  // Performance metrics
  const totalTrades = trades.filter(t => t.action !== 'HOLD').length;
  const winningTrades = trades.filter(t => t.action === 'SELL' && (t.total_value ?? 0) > 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / Math.max(trades.filter(t => t.action === 'SELL').length, 1)) * 100 : 0;

  return (
    <div className="p-6 space-y-6 grid-bg min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne)' }}>Portfolio</h1>
        <p className="text-white/40 text-sm font-mono mt-0.5">Holdings breakdown and trade history</p>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Trades', value: totalTrades.toString() },
          { label: 'Win Rate', value: `${winRate.toFixed(1)}%` },
          { label: 'Positions', value: stats?.positions.length.toString() ?? '0' },
          { label: 'Cash Balance', value: stats ? formatCurrency(stats.cashBalance) : '$100,000' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#111111] border border-white/10 rounded-lg p-4">
            <div className="text-white/40 text-xs font-mono tracking-widest uppercase mb-1">{label}</div>
            <div className="text-xl font-mono font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-[#111111] border border-white/10 rounded-lg p-5">
          <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase mb-4">Allocation</h2>
          {loading ? (
            <div className="h-72 bg-white/5 rounded animate-pulse" />
          ) : pieData.length > 0 ? (
            <PieChart data={pieData} />
          ) : (
            <div className="h-72 flex items-center justify-center text-white/20 text-sm font-mono">
              No holdings to display
            </div>
          )}
        </div>

        {/* Holdings Table */}
        <div className="bg-[#111111] border border-white/10 rounded-lg p-5">
          <h2 className="text-xs font-mono text-white/40 tracking-widest uppercase mb-4">Holdings Detail</h2>
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : stats && stats.positions.length > 0 ? (
            <div className="space-y-2">
              {stats.positions.map(pos => {
                const value = (pos.current_price ?? pos.avg_cost_basis) * Number(pos.shares);
                const pct = stats.totalValue > 0 ? (value / stats.totalValue) * 100 : 0;
                return (
                  <div key={pos.id} className="flex items-center justify-between py-2 border-b border-white/5">
                    <div>
                      <div className="font-mono font-bold text-white text-sm">{pos.symbol}</div>
                      <div className="text-white/30 text-xs font-mono">{Number(pos.shares).toFixed(4)} shares</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-white text-sm">{formatCurrency(value)}</div>
                      <div className="text-white/30 text-xs font-mono">{pct.toFixed(1)}% of portfolio</div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between py-2">
                <div className="font-mono text-white/40 text-sm">Cash</div>
                <div className="font-mono text-white text-sm">{formatCurrency(stats.cashBalance)}</div>
              </div>
            </div>
          ) : (
            <div className="text-white/20 text-sm font-mono text-center py-8">No holdings yet</div>
          )}
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-[#111111] border border-white/10 rounded-lg">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-mono text-white/60 tracking-widest uppercase">Trade History</h2>
        </div>
        {loading ? (
          <div className="p-5"><LoadingSkeleton rows={6} /></div>
        ) : trades.length > 0 ? (
          <div className="divide-y divide-white/5">
            {trades.map(trade => (
              <div key={trade.id}>
                <button
                  className="w-full px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] text-left transition-colors"
                  onClick={() => setExpandedTrades(prev => {
                    const next = new Set(prev);
                    if (next.has(trade.id)) next.delete(trade.id);
                    else next.add(trade.id);
                    return next;
                  })}
                >
                  <span className={clsx(
                    'w-14 text-center text-xs font-mono font-bold py-0.5 rounded',
                    trade.action === 'BUY' ? 'bg-[#AAFF00]/20 text-[#AAFF00]' :
                    trade.action === 'SELL' ? 'bg-red-500/20 text-red-400' :
                    'bg-white/10 text-white/40'
                  )}>
                    {trade.action}
                  </span>
                  <span className="font-mono font-bold text-white w-16">{trade.symbol}</span>
                  <span className="text-white/50 text-xs font-mono">
                    {trade.shares ? `${Number(trade.shares).toFixed(2)} shares` : ''} {trade.price ? `@ $${Number(trade.price).toFixed(2)}` : ''}
                  </span>
                  {trade.total_value && (
                    <span className="text-white/70 text-xs font-mono ml-auto">
                      {formatCurrency(Number(trade.total_value))}
                    </span>
                  )}
                  <span className="text-white/20 text-xs font-mono">
                    {new Date(trade.timestamp).toLocaleDateString()}
                  </span>
                  {trade.reasoning && (
                    expandedTrades.has(trade.id) ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />
                  )}
                </button>
                {expandedTrades.has(trade.id) && trade.reasoning && (
                  <div className="px-5 pb-3 bg-white/[0.01]">
                    <p className="text-white/50 text-sm border-l-2 border-[#AAFF00]/30 pl-3">
                      {trade.reasoning}
                    </p>
                    {trade.confidence && (
                      <p className="text-white/30 text-xs font-mono mt-1">
                        Confidence: {(Number(trade.confidence) * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-white/20 text-sm font-mono">
            No trades yet. Run AlphaBot to start trading.
          </div>
        )}
      </div>
    </div>
  );
}
