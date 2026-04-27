'use client';

import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import type { OHLCVBar } from '@/types';

interface Props {
  data: OHLCVBar[];
  positive?: boolean;
  height?: number;
}

export default function MiniChart({ data, positive = true, height = 52 }: Props) {
  const color = positive ? '#AAFF00' : '#ef4444';

  const chartData = data.slice(-30).map(bar => ({
    date: bar.date,
    value: bar.close,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`mini-grad-${positive}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#mini-grad-${positive})`}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-[#1a1a1a] border border-white/10 rounded px-2 py-1 text-xs font-mono text-white">
                ${Number(payload[0].value).toFixed(2)}
              </div>
            );
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
