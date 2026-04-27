'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { PortfolioSnapshot } from '@/types';
import { format, parseISO } from 'date-fns';

interface PortfolioChartProps {
  snapshots: PortfolioSnapshot[];
  startValue?: number;
}

export default function PortfolioChart({ snapshots, startValue = 100000 }: PortfolioChartProps) {
  const data = snapshots.map(s => ({
    date: format(parseISO(s.timestamp), 'MMM d'),
    value: s.total_value,
    pnl: s.total_value - startValue,
  }));

  const minVal = Math.min(...data.map(d => d.value), startValue) * 0.995;
  const maxVal = Math.max(...data.map(d => d.value), startValue) * 1.005;

  const formatDollar = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#AAFF00" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#AAFF00" stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minVal, maxVal]}
          tickFormatter={formatDollar}
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <Tooltip
          contentStyle={{
            background: '#111',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
          labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
          formatter={(val: unknown) => [
            `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            'Portfolio Value',
          ]}
        />
        <ReferenceLine y={startValue} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="value"
          stroke="url(#lineGradient)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#AAFF00', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
