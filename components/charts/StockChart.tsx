'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend, Area,
} from 'recharts';
import type { OHLCVBar } from '@/types';
import { format, parseISO } from 'date-fns';

interface Props {
  data: OHLCVBar[];
  symbol: string;
  sma20?: number[];
  sma50?: number[];
  height?: number;
}

type Range = '1W' | '1M' | '3M' | '6M' | '1Y';

const RANGES: { label: Range; days: number }[] = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[#111] border border-white/15 rounded-lg p-3 text-xs font-mono shadow-2xl min-w-[160px]">
      <div className="text-white/50 mb-2">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-white/50">Open</span>
          <span className="text-white">${d?.open?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/50">High</span>
          <span className="text-[#AAFF00]">${d?.high?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/50">Low</span>
          <span className="text-red-400">${d?.low?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/50">Close</span>
          <span className="text-white font-bold">${d?.close?.toFixed(2)}</span>
        </div>
        {d?.volume && (
          <div className="flex justify-between gap-4 pt-1 border-t border-white/10">
            <span className="text-white/50">Volume</span>
            <span className="text-white/70">{(d.volume / 1e6).toFixed(1)}M</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function StockChart({ data, symbol, sma20 = [], sma50 = [], height = 360 }: Props) {
  const [range, setRange] = useState<Range>('3M');

  const days = RANGES.find(r => r.label === range)?.days ?? 90;
  const sliced = data.slice(-days);

  const chartData = sliced.map((bar, i) => {
    const s20idx = sma20.length - sliced.length + i;
    const s50idx = sma50.length - sliced.length + i;
    const positive = bar.close >= bar.open;
    return {
      ...bar,
      date: (() => {
        try { return format(parseISO(bar.date), 'MMM d'); } catch { return bar.date; }
      })(),
      positive,
      candleColor: positive ? '#AAFF00' : '#ef4444',
      sma20: s20idx >= 0 && sma20[s20idx] ? parseFloat(sma20[s20idx].toFixed(2)) : undefined,
      sma50: s50idx >= 0 && sma50[s50idx] ? parseFloat(sma50[s50idx].toFixed(2)) : undefined,
    };
  });

  const prices = sliced.map(b => b.close);
  const firstPrice = prices[0] ?? 0;
  const lastPrice = prices[prices.length - 1] ?? 0;
  const isPositive = lastPrice >= firstPrice;
  const lineColor = isPositive ? '#AAFF00' : '#ef4444';

  const yMin = Math.min(...sliced.map(b => b.low)) * 0.995;
  const yMax = Math.max(...sliced.map(b => b.high)) * 1.005;

  return (
    <div className="space-y-3">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest">{symbol} — Price History</div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${
                range === r.label
                  ? 'bg-[#AAFF00]/20 text-[#AAFF00] border border-[#AAFF00]/30'
                  : 'text-white/40 hover:text-white border border-transparent hover:border-white/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main price chart */}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.15} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#priceGrad)"
            dot={false}
            name="Price"
            isAnimationActive={false}
          />
          {sma20.length > 0 && (
            <Line
              type="monotone"
              dataKey="sma20"
              stroke="#60a5fa"
              strokeWidth={1}
              dot={false}
              name="SMA 20"
              strokeDasharray="4 2"
              isAnimationActive={false}
            />
          )}
          {sma50.length > 0 && (
            <Line
              type="monotone"
              dataKey="sma50"
              stroke="#f59e0b"
              strokeWidth={1}
              dot={false}
              name="SMA 50"
              strokeDasharray="4 2"
              isAnimationActive={false}
            />
          )}
          <ReferenceLine
            y={firstPrice}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="3 3"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume chart */}
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide />
          <Bar
            dataKey="volume"
            name="Volume"
            isAnimationActive={false}
            radius={[1, 1, 0, 0]}
            // Color each bar individually by mapping
            fill="#AAFF00"
            opacity={0.4}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-[10px] font-mono text-white/20 text-center">VOLUME</div>
    </div>
  );
}
