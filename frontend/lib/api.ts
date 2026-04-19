/**
 * Derive API/WS URLs at runtime so the frontend works everywhere:
 * - With env overrides (self-hosted / prod)
 * - On GitHub Codespaces (where port 3000 and 8000 get different forwarded hostnames like
 *   `<name>-3000.app.github.dev` and `<name>-8000.app.github.dev`)
 * - On localhost dev
 */
function deriveUrls(): { api: string; ws: string } {
  const envApi = process.env.NEXT_PUBLIC_API_URL;
  const envWs = process.env.NEXT_PUBLIC_WS_URL;
  if (envApi && envWs) return { api: envApi, ws: envWs };

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const wsProto = protocol === "https:" ? "wss:" : "ws:";

    // Codespaces: swap -3000 for -8000 in the forwarded hostname
    const cs = hostname.match(/^(.*)-(\d+)\.app\.github\.dev$/);
    if (cs) {
      const backendHost = `${cs[1]}-8000.app.github.dev`;
      return {
        api: `${protocol}//${backendHost}`,
        ws: `${wsProto}//${backendHost}/ws/signals`,
      };
    }

    // localhost dev: frontend on 3000, backend on 8000
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return {
        api: `${protocol}//${hostname}:8000`,
        ws: `${wsProto}//${hostname}:8000/ws/signals`,
      };
    }

    // Same-host deployment with backend reverse-proxied on the same origin
    const host = port ? `${hostname}:${port}` : hostname;
    return {
      api: `${protocol}//${host}`,
      ws: `${wsProto}//${host}/ws/signals`,
    };
  }

  return {
    api: envApi ?? "http://localhost:8000",
    ws: envWs ?? "ws://localhost:8000/ws/signals",
  };
}

const urls = deriveUrls();
export const API_URL = urls.api;
export const WS_URL = urls.ws;

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
