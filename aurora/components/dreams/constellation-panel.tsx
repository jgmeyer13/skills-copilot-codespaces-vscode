"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Compass, Sparkles, Loader2, Wand2, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { computeSymbolStats } from "@/lib/constellations";
import { type Dream } from "@/lib/dreams";
import { type Thread } from "@/lib/threads";

type Props = {
  open: boolean;
  dreams: Dream[];

  // Symbol filter
  symbolFilter: string | null;
  onSelectSymbol: (symbol: string | null) => void;

  // AI threads
  threads: Thread[];
  threadsLoading: boolean;
  threadsError: string | null;
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  onRevealThreads: () => void;
};

export function ConstellationPanel({
  open,
  dreams,
  symbolFilter,
  onSelectSymbol,
  threads,
  threadsLoading,
  threadsError,
  selectedThreadId,
  onSelectThread,
  onRevealThreads,
}: Props) {
  const stats = useMemo(() => computeSymbolStats(dreams), [dreams]);
  const hasThreads = threads.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: -16, y: 4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          className="absolute bottom-20 left-6 z-30 w-[280px] glass-strong rounded-2xl p-4"
        >
          <div className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-nebula-violet to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55">
              <Compass size={11} className="text-nebula-violet-soft" />
              Constellations
            </div>
            {(symbolFilter || selectedThreadId) && (
              <button
                onClick={() => {
                  onSelectSymbol(null);
                  onSelectThread(null);
                }}
                className="text-[10px] uppercase tracking-[0.18em] text-white/55 transition-colors hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* AI threads section */}
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55">
                <Wand2 size={10} className="text-nebula-violet-soft" />
                Latent threads
              </div>
              {hasThreads && (
                <button
                  onClick={onRevealThreads}
                  disabled={threadsLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] tracking-normal text-white/70 normal-case transition-colors hover:text-white disabled:opacity-50"
                  aria-label="Refresh threads"
                >
                  <RefreshCw
                    size={10}
                    className={threadsLoading ? "animate-spin" : ""}
                  />
                </button>
              )}
            </div>

            {!hasThreads && !threadsLoading && (
              <button
                onClick={onRevealThreads}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-nebula-violet/15 via-transparent to-nebula-cyan/15 px-3 py-2.5 text-[12px] text-white/85 transition-colors hover:text-white"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(120% 60% at 50% 100%, rgba(168,85,247,0.18), transparent)",
                  }}
                />
                <Sparkles
                  size={13}
                  className="text-nebula-violet-soft animate-pulse-glow"
                />
                Reveal latent threads
              </button>
            )}

            {threadsLoading && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-[12px] text-white/65">
                <Loader2 size={12} className="animate-spin" />
                Reading your galaxy…
              </div>
            )}

            {threadsError && !threadsLoading && (
              <div className="mb-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-200/80">
                {threadsError}
              </div>
            )}

            {hasThreads && (
              <div className="space-y-1">
                {threads.map((t) => {
                  const active = selectedThreadId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        onSelectThread(active ? null : t.id)
                      }
                      title={t.rationale}
                      className={`group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${
                        active
                          ? "bg-white/[0.06] text-white"
                          : "text-white/75 hover:bg-white/[0.03] hover:text-white"
                      }`}
                      style={
                        active
                          ? {
                              boxShadow:
                                "inset 0 0 0 1px rgba(224,208,255,0.35), 0 0 14px rgba(168,85,247,0.20)",
                            }
                          : undefined
                      }
                    >
                      <span
                        className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: "#E0D0FF",
                          boxShadow: "0 0 8px #E0D0FF",
                        }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{t.name}</span>
                        <span className="block truncate text-[11px] text-white/45">
                          {t.dreamIds.length} dreams · {t.rationale}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hairline my-3" />

          {/* Symbol section */}
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55">
            <Sparkles size={10} className="text-nebula-cyan-soft" />
            Shared symbols
          </div>

          {stats.length === 0 ? (
            <span className="text-[12px] text-white/45">
              No shared symbols yet. Add more dreams to see constellations.
            </span>
          ) : (
            <div className="max-h-[180px] overflow-y-auto pr-1 no-scrollbar">
              <button
                onClick={() => onSelectSymbol(null)}
                className={`group mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
                  symbolFilter === null
                    ? "bg-white/[0.04] text-white"
                    : "text-white/65 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span className="inline-flex items-center gap-2">All</span>
                <span className="font-mono text-[11px] text-white/45">
                  {stats.reduce((acc, s) => acc + s.edgeCount, 0)}
                </span>
              </button>

              {stats.map((s) => {
                const active = symbolFilter === s.symbol;
                return (
                  <button
                    key={s.symbol}
                    onClick={() => onSelectSymbol(active ? null : s.symbol)}
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
                    <span className="font-mono text-[11px] text-white/45">
                      {s.edgeCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
