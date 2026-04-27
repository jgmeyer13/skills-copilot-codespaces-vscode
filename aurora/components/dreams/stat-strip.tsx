"use client";

import { motion } from "framer-motion";
import { type Dream, EMOTION_COLOR, EMOTION_LABEL } from "@/lib/dreams";
import { useMemo } from "react";

type Props = { dreams: Dream[] };

export function StatStrip({ dreams }: Props) {
  const stats = useMemo(() => {
    const total = dreams.length;
    const avgVivid =
      total === 0
        ? 0
        : dreams.reduce((s, d) => s + d.vividness, 0) / total;
    const lucid = dreams.filter((d) => d.emotion === "lucid").length;
    const lucidPct = total === 0 ? 0 : (lucid / total) * 100;

    const counts = new Map<string, number>();
    dreams.forEach((d) =>
      d.symbols.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1)),
    );
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      avgVivid: avgVivid.toFixed(1),
      lucidPct: lucidPct.toFixed(0),
      topSymbol: top?.[0] ?? "—",
    };
  }, [dreams]);

  const items = [
    { label: "Stars in galaxy", value: stats.total, glow: "violet" as const },
    { label: "Avg vividness", value: stats.avgVivid, glow: "cyan" as const },
    { label: "Lucid rate", value: `${stats.lucidPct}%`, glow: "lime" as const },
    { label: "Top symbol", value: stats.topSymbol, glow: "violet" as const },
  ];

  const glowColor = {
    violet: "#A855F7",
    cyan: "#22D3EE",
    lime: "#4ADE80",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="absolute left-6 top-24 z-30 flex flex-col gap-3"
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="glass relative w-[180px] rounded-xl px-4 py-3"
        >
          <div
            className="pointer-events-none absolute inset-y-2 left-0 w-px rounded-full"
            style={{
              background: glowColor[it.glow],
              boxShadow: `0 0 10px ${glowColor[it.glow]}`,
            }}
          />
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
            {it.label}
          </div>
          <div className="mt-1 font-mono text-xl text-white">{it.value}</div>
        </div>
      ))}
    </motion.div>
  );
}

export function EmotionLegend() {
  const all = Object.entries(EMOTION_LABEL) as [
    keyof typeof EMOTION_LABEL,
    string,
  ][];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 glass rounded-full px-4 py-2"
    >
      <div className="flex items-center gap-3">
        {all.map(([k, label]) => (
          <div
            key={k}
            className="flex items-center gap-1.5 text-[11px] text-white/65"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: EMOTION_COLOR[k],
                boxShadow: `0 0 8px ${EMOTION_COLOR[k]}`,
              }}
            />
            {label}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
