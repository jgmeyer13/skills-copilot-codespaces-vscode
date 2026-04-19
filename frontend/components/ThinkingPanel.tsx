import { ConfidenceReport } from "@/lib/api";

export function ThinkingPanel({ confidence }: { confidence: ConfidenceReport | null }) {
  return (
    <div className="panel p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em] text-mute">AI Thinking</div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] text-mute uppercase tracking-widest">Live</span>
        </div>
      </div>
      {confidence ? (
        <>
          <div className="text-sm font-mono mb-3">
            <span
              className={
                confidence.direction === "BUY"
                  ? "text-bull"
                  : confidence.direction === "SELL"
                  ? "text-bear"
                  : "text-mute"
              }
            >
              {confidence.direction}
            </span>{" "}
            — {(confidence.confidence * 100).toFixed(2)}% probability
          </div>
          <ul className="space-y-2 text-sm text-gray-300 font-mono scroll-thin overflow-auto pr-2">
            {confidence.reasoning.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-accent mt-0.5">›</span>
                <span className={r.startsWith("REJECTED") ? "text-bear" : ""}>{r}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="text-mute text-sm">Waiting for first signal…</div>
      )}
    </div>
  );
}
