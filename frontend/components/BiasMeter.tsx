import { ConfidenceReport } from "@/lib/api";

export function BiasMeter({ confidence }: { confidence: ConfidenceReport | null }) {
  const dir = confidence?.direction ?? "FLAT";
  const pct = confidence ? confidence.confidence * 100 : 50;
  const buyPct = dir === "SELL" ? 100 - pct : dir === "BUY" ? pct : 50;
  const tone =
    dir === "BUY"
      ? "text-bull"
      : dir === "SELL"
      ? "text-bear"
      : "text-mute";

  return (
    <div className="panel p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-mute mb-3">AI Bias</div>
      <div className={`text-4xl font-mono font-semibold ${tone}`}>
        {dir} {confidence ? `${(confidence.confidence * 100).toFixed(1)}%` : "—"}
      </div>
      <div className="mt-4 h-2 rounded-full bg-panel2 overflow-hidden relative">
        <div
          className="absolute left-0 top-0 bottom-0 bg-bull/70 transition-all"
          style={{ width: `${buyPct}%` }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 bg-bear/70 transition-all"
          style={{ width: `${100 - buyPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-mute mt-1 font-mono">
        <span>BUY {buyPct.toFixed(0)}%</span>
        <span>SELL {(100 - buyPct).toFixed(0)}%</span>
      </div>
      <div className="mt-4 flex gap-4 text-xs">
        <div>
          <div className="text-mute uppercase tracking-[0.2em] text-[10px]">Expectancy</div>
          <div className={`font-mono ${(confidence?.expectancy_r ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
            {confidence ? `${confidence.expectancy_r >= 0 ? "+" : ""}${confidence.expectancy_r.toFixed(2)}R` : "—"}
          </div>
        </div>
        <div>
          <div className="text-mute uppercase tracking-[0.2em] text-[10px]">Gate</div>
          <div className={`font-mono ${confidence?.accepted ? "text-bull" : "text-mute"}`}>
            {confidence?.accepted ? "PASS" : "FLAT"}
          </div>
        </div>
      </div>
    </div>
  );
}
