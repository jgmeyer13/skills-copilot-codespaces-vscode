export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "bull" | "bear" | "accent";
}) {
  const toneClass =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
      ? "text-bear"
      : tone === "accent"
      ? "text-accent"
      : "text-gray-200";
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-mute mb-1">{label}</div>
      <div className={`text-2xl font-mono ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-mute mt-1">{sub}</div>}
    </div>
  );
}
