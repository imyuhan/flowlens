export function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? "bg-emerald-500" : score >= 30 ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/70" aria-label={`优先级 ${score} 分`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-semibold text-slate-700">{score} 分</span>
    </div>
  );
}
