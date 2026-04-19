"use client";
import { useEffect, useRef, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { BiasMeter } from "@/components/BiasMeter";
import { CorrelationPanel } from "@/components/CorrelationPanel";
import { ThinkingPanel } from "@/components/ThinkingPanel";
import { TradeJournal } from "@/components/TradeJournal";
import { StatCard } from "@/components/StatCard";
import { SignalPayload, WS_URL } from "@/lib/api";

export default function Page() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retry = setTimeout(connect, 2000);
      };
      ws.onmessage = (ev) => {
        try {
          setSignal(JSON.parse(ev.data));
        } catch {
          /* ignore malformed frames */
        }
      };
    };
    connect();
    return () => {
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const us100 = signal?.us100_price;
  const spx = signal?.spx_price;
  const volUs = signal?.volatility_us100;
  const structUs = signal?.structure_us100;

  return (
    <main className="min-h-screen p-6 max-w-[1600px] mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-wide">
            ATLAS <span className="text-mute font-normal">· Autonomous Trading & Learning Algorithm System</span>
          </h1>
          <div className="text-[11px] text-mute font-mono mt-1">
            US100 · SPX500 · probability-driven research terminal
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-bull animate-pulse" : "bg-mute"}`} />
          <span className="text-mute uppercase tracking-widest">
            {connected ? "Stream live" : "Reconnecting"}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard
          label="US100"
          value={us100 ? us100.toFixed(2) : "—"}
          sub={volUs ? `ATR ${volUs.atr.toFixed(2)} · ${volUs.regime}` : undefined}
          tone="accent"
        />
        <StatCard
          label="SPX500"
          value={spx ? spx.toFixed(2) : "—"}
          sub={signal ? `Structure ${signal.structure_spx.bias}` : undefined}
          tone="accent"
        />
        <StatCard
          label="BOS · US100"
          value={structUs ? `${(structUs.bos_probability * 100).toFixed(0)}%` : "—"}
          sub={structUs ? `${structUs.bias} · sweep ${(structUs.liquidity_sweep * 100).toFixed(0)}%` : undefined}
          tone={structUs?.bias === "bullish" ? "bull" : structUs?.bias === "bearish" ? "bear" : "neutral"}
        />
        <StatCard
          label="Suggested Size"
          value={signal?.suggested_size ? signal.suggested_size.toFixed(3) : "—"}
          sub={
            signal?.suggested_stop && signal?.suggested_tp
              ? `SL ${signal.suggested_stop.toFixed(1)} · TP ${signal.suggested_tp.toFixed(1)}`
              : "No trade — gate not passed"
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="col-span-2 grid grid-rows-2 gap-4">
          <PriceChart symbol="NAS100" title="US100 (Nasdaq)" />
          <PriceChart symbol="SPX500" title="S&P 500" />
        </div>
        <div className="flex flex-col gap-4">
          <BiasMeter confidence={signal?.confidence ?? null} />
          <CorrelationPanel
            correlation={signal?.correlation ?? null}
            leadLag={signal?.lead_lag ?? null}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ThinkingPanel confidence={signal?.confidence ?? null} />
        <TradeJournal />
      </div>

      <footer className="mt-6 text-[10px] text-mute font-mono">
        ATLAS M1 · Research only. No guaranteed returns. Expectancy + probability gated.
      </footer>
    </main>
  );
}
