export default function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-white/5 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
