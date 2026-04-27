import { clsx } from 'clsx';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
  accent?: boolean;
  loading?: boolean;
}

export default function StatCard({ label, value, sub, positive, negative, accent, loading }: StatCardProps) {
  return (
    <div className={clsx(
      'bg-[#111111] border rounded-lg p-4 flex flex-col gap-1',
      accent ? 'border-[#AAFF00]/40 shadow-[0_0_20px_rgba(170,255,0,0.08)]' : 'border-white/10'
    )}>
      <span className="text-white/40 text-xs font-mono tracking-widest uppercase">{label}</span>
      {loading ? (
        <div className="h-7 w-32 bg-white/10 rounded animate-pulse" />
      ) : (
        <span className={clsx(
          'text-2xl font-mono font-bold tracking-tight',
          positive && 'text-[#AAFF00]',
          negative && 'text-red-400',
          !positive && !negative && 'text-white'
        )}>
          {value}
        </span>
      )}
      {sub && <span className="text-white/40 text-xs font-mono">{sub}</span>}
    </div>
  );
}
