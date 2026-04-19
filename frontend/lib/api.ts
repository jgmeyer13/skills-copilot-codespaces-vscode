export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/signals";

export type CorrelationReport = {
  coefficient: number;
  strength: "weak" | "moderate" | "strong";
  divergence: boolean;
  window: number;
};

export type LeadLagReport = {
  leader: string | null;
  follower: string | null;
  lag_bars: number;
  strength: number;
};

export type VolatilityReport = {
  atr: number;
  regime: "low" | "normal" | "high";
  std_pct: number;
};

export type StructureReport = {
  bos_probability: number;
  liquidity_sweep: number;
  order_block_strength: number;
  bias: "bullish" | "bearish" | "neutral";
};

export type ConfidenceReport = {
  direction: "BUY" | "SELL" | "FLAT";
  confidence: number;
  expectancy_r: number;
  reasoning: string[];
  accepted: boolean;
};

export type SignalPayload = {
  ts: string;
  us100_price: number;
  spx_price: number;
  correlation: CorrelationReport;
  lead_lag: LeadLagReport;
  volatility_us100: VolatilityReport;
  volatility_spx: VolatilityReport;
  structure_us100: StructureReport;
  structure_spx: StructureReport;
  confidence: ConfidenceReport;
  suggested_stop: number | null;
  suggested_tp: number | null;
  suggested_size: number | null;
};

export type JournalStats = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_rr: number;
  expectancy_r: number;
  net_pnl: number;
};

export async function fetchStats(): Promise<JournalStats> {
  const r = await fetch(`${API_URL}/api/journal/stats`, { cache: "no-store" });
  return r.json();
}

export async function fetchOhlc(symbol: string, timeframe = "5m", bars = 200) {
  const r = await fetch(
    `${API_URL}/api/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&bars=${bars}`,
    { cache: "no-store" }
  );
  return r.json() as Promise<{
    symbol: string;
    timeframe: string;
    bars: [number, number, number, number, number][];
  }>;
}
