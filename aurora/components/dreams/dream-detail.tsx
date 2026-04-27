"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Tag,
  Sparkles,
  CalendarDays,
  Flame,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Dream, EMOTION_COLOR, EMOTION_LABEL } from "@/lib/dreams";
import { formatDate } from "@/lib/utils";
import { streamInterpret } from "@/lib/stream";

type Props = {
  dream: Dream | null;
  onClose: () => void;
  onUpdateInterpretation?: (id: string, text: string) => void;
};

export function DreamDetail({ dream, onClose, onUpdateInterpretation }: Props) {
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream when the user closes or switches dreams.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [dream?.id]);

  useEffect(() => {
    setLiveText(null);
    setError(null);
    setStreaming(false);
  }, [dream?.id]);

  async function reinterpret() {
    if (!dream || streaming) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStreaming(true);
    setError(null);
    let acc = "";
    try {
      for await (const delta of streamInterpret(
        {
          title: dream.title,
          body: dream.body,
          emotion: dream.emotion,
          vividness: dream.vividness,
        },
        ac.signal,
      )) {
        acc += delta;
        setLiveText(acc);
      }
      onUpdateInterpretation?.(dream.id, acc.trim());
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Re-interpret failed");
    } finally {
      if (!ac.signal.aborted) setStreaming(false);
    }
  }

  return (
    <AnimatePresence>
      {dream && (
        <motion.aside
          key={dream.id}
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          className="absolute right-6 top-24 z-30 w-[380px] glass-strong rounded-2xl p-5"
        >
          {/* Glow accent strip */}
          <div
            className="pointer-events-none absolute inset-x-0 -top-px h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${EMOTION_COLOR[dream.emotion]}, transparent)`,
            }}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  background: EMOTION_COLOR[dream.emotion],
                  boxShadow: `0 0 14px ${EMOTION_COLOR[dream.emotion]}`,
                }}
              />
              <span className="text-xs uppercase tracking-[0.2em] text-white/55">
                {EMOTION_LABEL[dream.emotion]}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-white/45 transition-colors hover:text-white"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <h2 className="mt-3 text-xl font-medium leading-snug tracking-tight">
            {dream.title}
          </h2>

          <div className="mt-2 flex items-center gap-3 text-[11px] text-white/45">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={11} />
              {formatDate(dream.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Flame size={11} />
              Vividness {dream.vividness}/10
            </span>
          </div>

          <div className="hairline mt-4" />

          <p className="mt-4 text-sm leading-relaxed text-white/80">
            {dream.body}
          </p>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">
              <Tag size={11} />
              Symbols
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dream.symbols.map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/75"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-5 rounded-xl border border-white/8 bg-gradient-to-br from-nebula-violet/10 via-transparent to-nebula-cyan/10 p-3.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.2em] text-white/55">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles
                  size={11}
                  className={
                    streaming
                      ? "text-nebula-violet-soft animate-pulse-glow"
                      : "text-nebula-violet-soft"
                  }
                />
                AI Interpretation
              </span>
              <button
                onClick={reinterpret}
                disabled={streaming}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] tracking-normal text-white/70 normal-case transition-colors hover:text-white disabled:opacity-50"
                aria-label="Re-interpret with Aurora"
              >
                <RefreshCw
                  size={10}
                  className={streaming ? "animate-spin" : ""}
                />
                {streaming ? "Reading…" : "Re-interpret"}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap">
              {liveText ?? dream.interpretation}
              {streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-nebula-violet-soft align-middle" />
              )}
            </p>
            {error && (
              <p className="mt-2 text-[11px] text-rose-300/80">{error}</p>
            )}
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
