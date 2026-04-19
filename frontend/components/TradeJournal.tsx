"use client";
import { useEffect, useState } from "react";
import { API_URL, JournalStats, fetchStats } from "@/lib/api";

type TradeRow = {
  id: number;
  created_at: string;
  symbol: string;
  direction: string;
  entry: number;
  stop: number;
  take_profit: number;
  size: number;
  confidence: number;
  expectancy_r: number;
  pnl: number | null;
  pnl_r: number | null;
  status: string;
};

export function TradeJournal() {
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t] = await Promise.all([
          fetchStats(),
          fetch(`${API_URL}/api/journal/trades?limit=15`).then((r) => r.json()),
        ]);
        setStats(s);
        setTrades(t);
      } catch {
        /* backend may not be up yet */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="panel p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em] text-mute">Trade Journal</div>
        <div className="text-[10px] font-mono text-mute">
          {stats ? `${stats.total_trades} trades · ${(stats.win_rate * 100).toFixed(0)}% WR` : "—"}
        </div>
      </div>
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-3 text-xs font-mono">
          <Stat label="Net PnL" value={`$${stats.net_pnl.toFixed(0)}`} tone={stats.net_pnl >= 0 ? "bull" : "bear"} />
          <Stat label="Expectancy" value={`${stats.expectancy_r >= 0 ? "+" : ""}${stats.expectancy_r.toFixed(2)}R`} tone={stats.expectancy_r >= 0 ? "bull" : "bear"} />
          <Stat label="Avg RR" value={stats.avg_rr.toFixed(2)} />
          <Stat label="W/L" value={`${stats.wins}/${stats.losses}`} />
        </div>
      )}
      <div className="flex-1 overflow-auto scroll-thin">
        {trades.length === 0 ? (
          <div className="text-mute text-sm pt-4">
            No trades recorded yet — the system only records trades when confidence ≥ threshold and expectancy is positive.
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="text-mute uppercase tracking-widest text-[10px]">
              <tr>
                <th className="text-left py-1">Symbol</th>
                <th className="text-left">Dir</th>
                <th className="text-right">Entry</th>
                <th className="text-right">SL / TP</th>
                <th className="text-right">Conf</th>
                <th className="text-right">PnL</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-edge">
                  <td className="py-1.5">{t.symbol}</td>
                  <td className={t.direction === "BUY" ? "text-bull" : "text-bear"}>{t.direction}</td>
                  <td className="text-right">{t.entry.toFixed(2)}</td>
                  <td className="text-right text-mute">{t.stop.toFixed(0)} / {t.take_profit.toFixed(0)}</td>
                  <td className="text-right">{(t.confidence * 100).toFixed(0)}%</td>
                  <td className={`text-right ${(t.pnl ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                    {t.pnl !== null ? t.pnl.toFixed(2) : "—"}
                  </td>
                  <td className="text-right text-mute">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  const toneClass = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-gray-200";
  return (
    <div className="bg-panel2 border border-edge rounded px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-mute">{label}</div>
      <div className={toneClass}>{value}</div>
    </div>
  );
}
