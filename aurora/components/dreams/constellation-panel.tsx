"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Compass, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { computeSymbolStats } from "@/lib/constellations";
import { type Dream } from "@/lib/dreams";

type Props = {
  open: boolean;
  dreams: Dream[];
  symbolFilter: string | null;
  onSelectSymbol: (symbol: string | null) => void;
};

export function ConstellationPanel({
  open,
  dreams,
  symbolFilter,
  onSelectSymbol,
}: Props) {
  const stats = useMemo(() => computeSymbolStats(dreams), [dreams]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: -16, y: 4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          className="absolute bottom-20 left-6 z-30 w-[260px] glass-strong rounded-2xl p-4"
        >
          <div className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-nebula-violet to-transparent" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55">
              <Compass size={11} className="text-nebula-violet-soft" />
              Constellations
            </div>
            {symbolFilter && (
              <button
                onClick={() => onSelectSymbol(null)}
                className="text-[10px] uppercase tracking-[0.18em] text-white/55 transition-colors hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-2 text-sm text-white/85">
            {stats.length === 0 ? (
              <span className="text-white/45">
                No shared symbols yet. Add more dreams to see constellations.
              </span>
            ) : symbolFilter ? (
              <>
                Tracing{" "}
                <span
                  className="font-medium"
                  style={{ color: stats.find((s) => s.symbol === symbolFilter)?.color ?? "#fff" }}
                >
                  {symbolFilter}
                </span>
                <span className="text-white/55"> across your galaxy</span>
              </>
            ) : (
              <>
                <span className="text-white">{stats.length}</span>
                <span className="text-white/55">
                  {" "}
                  symbol{stats.length === 1 ? "" : "s"} weave through your dreams
                </span>
              </>
            )}
          </div>

          {stats.length > 0 && (
            <>
              <div className="hairline my-3" />

              <div className="max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                <button
                  onClick={() => onSelectSymbol(null)}
                  className={`group mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
                    symbolFilter === null
                      ? "bg-white/[0.06] text-white"
                      : "text-white/65 hover:bg-white/[0.03] hover:text-white"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles
                      size={11}
                      className="text-nebula-violet-soft"
                    />
                    All connections
                  </span>
                  <span className="font-mono text-[11px] text-white/55">
                    {stats.reduce((acc, s) => acc + s.edgeCount, 0)}
                  </span>
                </button>

                {stats.map((s) => {
                  const active = symbolFilter === s.symbol;
                  return (
                    <button
                      key={s.symbol}
                      onClick={() =>
                        onSelectSymbol(active ? null : s.symbol)
                      }
                      className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
                        active
                          ? "bg-white/[0.06] text-white"
                          : "text-white/65 hover:bg-white/[0.03] hover:text-white"
                      }`}
                      style={
                        active
                          ? {
                              boxShadow: `inset 0 0 0 1px ${s.color}40, 0 0 14px ${s.color}30`,
                            }
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: s.color,
                            boxShadow: `0 0 8px ${s.color}`,
                          }}
                        />
                        {s.symbol}
                      </span>
                      <span className="inline-flex items-center gap-2 text-[11px] text-white/45">
                        <span className="font-mono">{s.edgeCount}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
