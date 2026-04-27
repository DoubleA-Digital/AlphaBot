'use client';

import MarketOverview from '@/components/MarketOverview';
import { Activity } from 'lucide-react';

export default function MarketPage() {
  return (
    <div className="p-5 space-y-5 grid-bg min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-syne)' }}>
            Live Market
          </h1>
          <p className="text-white/40 text-xs font-mono mt-0.5">
            Real-time prices · 30-day sparklines · Auto-refresh every 60s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#AAFF00] animate-pulse" />
          <span className="text-[#AAFF00] text-xs font-mono">LIVE</span>
        </div>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-lg p-1.5 flex items-center gap-2 text-xs font-mono text-white/30">
        <Activity size={11} className="ml-2" />
        Prices update every 60 seconds. Charts show 30-day price history. Click any card to highlight.
      </div>

      <MarketOverview />
    </div>
  );
}
