'use client';

import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip, Legend } from 'recharts';

interface PieChartProps {
  data: { name: string; value: number }[];
}

const COLORS = ['#AAFF00', '#00D4FF', '#FF6B00', '#FF0066', '#9B59B6', '#F39C12', '#1ABC9C', '#E74C3C'];

export default function PieChart({ data }: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsPie>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#111',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
          formatter={(val: unknown) => [`$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Value']}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'monospace' }}>
              {value}
            </span>
          )}
        />
      </RechartsPie>
    </ResponsiveContainer>
  );
}
