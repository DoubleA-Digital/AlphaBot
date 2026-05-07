'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface Alert {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  related_symbol: string | null;
}

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  TRADE_BUY:    { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400' },
  TRADE_SELL:   { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400' },
  STOP_LOSS:    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400' },
  TARGET_HIT:   { bg: 'bg-[#AAFF00]/10', border: 'border-[#AAFF00]/30',  text: 'text-[#AAFF00]' },
  TIME_STOP:    { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  NO_TRADES:    { bg: 'bg-white/5',       border: 'border-white/10',      text: 'text-white/50' },
  MARKET_ALERT: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
  DEFENSIVE_MODE: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
  DAILY_SUMMARY:  { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400' },
};

function getStyle(type: string) {
  return TYPE_STYLES[type] ?? { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/50' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setRefreshing(true);
      const r = await fetch('/api/alerts?limit=100');
      const d = await r.json();
      setAlerts(d.alerts ?? []);
      setUnreadCount(d.unreadCount ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const i = setInterval(fetchAlerts, 30000);
    return () => clearInterval(i);
  }, [fetchAlerts]);

  async function markAllRead() {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAll: true }) });
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  return (
    <div className="p-5 space-y-5 min-h-full" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3" style={{ fontFamily: 'var(--font-syne)' }}>
            <Bell size={22} className="text-[#AAFF00]" />
            Alerts
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-mono font-bold rounded-full">
                {unreadCount} new
              </span>
            )}
          </h1>
          <p className="text-white/40 text-xs font-mono mt-0.5">AlphaBot activity notifications and trade alerts</p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-white/50 hover:text-white text-xs font-mono transition-all"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
          <button
            onClick={fetchAlerts}
            disabled={refreshing}
            className="p-2 rounded border border-white/10 text-white/40 hover:text-white transition-all"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Bell size={36} className="text-white/10" />
          <div className="text-white/20 text-sm font-mono text-center">
            <div>No alerts yet</div>
            <div className="text-white/10 mt-1 text-xs">Enable Autopilot Mode to start receiving trade notifications</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(alert => {
            const style = getStyle(alert.type);
            return (
              <div
                key={alert.id}
                className={clsx(
                  'rounded-lg border p-4 transition-all',
                  style.bg, style.border,
                  !alert.is_read && 'ring-1 ring-white/10'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!alert.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      )}
                      <span className={clsx('text-sm font-mono font-bold', style.text)}>
                        {alert.title}
                      </span>
                      {alert.related_symbol && (
                        <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-white/40">
                          {alert.related_symbol}
                        </span>
                      )}
                    </div>
                    <p className="text-white/50 text-xs font-mono leading-relaxed">{alert.body}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-white/20 text-[10px] font-mono">{timeAgo(alert.created_at)}</span>
                    {!alert.is_read && (
                      <button
                        onClick={() => markRead(alert.id)}
                        className="p-1 text-white/20 hover:text-white/60 transition-colors"
                        title="Mark as read"
                      >
                        <Check size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
