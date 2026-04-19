"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, Time } from "lightweight-charts";
import { fetchOhlc } from "@/lib/api";

export function PriceChart({ symbol, title }: { symbol: string; title: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1117" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: { borderColor: "#1f2937" },
      timeScale: { borderColor: "#1f2937", timeVisible: true, secondsVisible: false },
      width: ref.current.clientWidth,
      height: 280,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const handle = () => chart.applyOptions({ width: ref.current!.clientWidth });
    window.addEventListener("resize", handle);

    let cancelled = false;
    (async () => {
      const data = await fetchOhlc(symbol, "5m", 200);
      if (cancelled) return;
      const candles: CandlestickData[] = data.bars.map(([ts, o, h, l, c]) => ({
        time: ts as Time,
        open: o,
        high: h,
        low: l,
        close: c,
      }));
      series.setData(candles);
      chart.timeScale().fitContent();
    })();

    const poll = setInterval(async () => {
      const data = await fetchOhlc(symbol, "5m", 200);
      const candles: CandlestickData[] = data.bars.map(([ts, o, h, l, c]) => ({
        time: ts as Time,
        open: o,
        high: h,
        low: l,
        close: c,
      }));
      series.setData(candles);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("resize", handle);
      chart.remove();
    };
  }, [symbol]);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-[0.2em] text-mute">{title}</div>
        <div className="text-[10px] text-mute font-mono">5m · {symbol}</div>
      </div>
      <div ref={ref} />
    </div>
  );
}
