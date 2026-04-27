"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, Sparkles, CalendarDays, Flame } from "lucide-react";
import { type Dream, EMOTION_COLOR, EMOTION_LABEL } from "@/lib/dreams";
import { formatDate } from "@/lib/utils";

type Props = {
  dream: Dream | null;
  onClose: () => void;
};

export function DreamDetail({ dream, onClose }: Props) {
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
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/55">
              <Sparkles size={11} className="text-nebula-violet-soft" />
              AI Interpretation
            </div>
            <p className="text-sm leading-relaxed text-white/85">
              {dream.interpretation}
            </p>
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
