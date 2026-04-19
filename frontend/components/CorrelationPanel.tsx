import { CorrelationReport, LeadLagReport } from "@/lib/api";

export function CorrelationPanel({
  correlation,
  leadLag,
}: {
  correlation: CorrelationReport | null;
  leadLag: LeadLagReport | null;
}) {
  const coef = correlation?.coefficient ?? 0;
  const pct = Math.min(100, Math.abs(coef) * 100);
  return (
    <div className="panel p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-mute mb-3">Correlation · Lead–Lag</div>
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-mono">
          {coef >= 0 ? "+" : ""}
          {coef.toFixed(3)}
        </div>
        <div className="text-xs uppercase tracking-widest text-mute">
          {correlation?.strength ?? "—"}
        </div>
        {correlation?.divergence && (
          <span className="text-[10px] uppercase tracking-widest text-bear font-mono bg-bear/10 px-2 py-0.5 rounded">
            Divergence
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-panel2 overflow-hidden">
        <div
          className={`h-full ${coef >= 0 ? "bg-bull/80" : "bg-bear/80"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-4 text-sm">
        {leadLag?.leader ? (
          <span className="font-mono text-gray-300">
            <span className="text-accent">{leadLag.leader}</span> leading{" "}
            <span className="text-accent">{leadLag.follower}</span> by {leadLag.lag_bars} bar
            {leadLag.lag_bars > 1 ? "s" : ""}{" "}
            <span className="text-mute">
              (|xcorr|={leadLag.strength.toFixed(2)})
            </span>
          </span>
        ) : (
          <span className="text-mute">No lead detected — symbols moving in lockstep</span>
        )}
      </div>
    </div>
  );
}
