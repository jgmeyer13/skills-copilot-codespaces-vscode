"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  type Emotion,
  EMOTION_COLOR,
  EMOTION_LABEL,
  type Dream,
} from "@/lib/dreams";
import { NeonButton } from "@/components/ui/neon-button";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (dream: Dream) => void;
};

const ALL_EMOTIONS: Emotion[] = [
  "wonder",
  "lucid",
  "joy",
  "peaceful",
  "anxious",
  "fear",
  "sorrow",
];

export function NewDreamModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [emotion, setEmotion] = useState<Emotion>("wonder");
  const [vividness, setVividness] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setEmotion("wonder");
    setVividness(7);
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    // Simulated AI parse delay so the shimmer feels real.
    await new Promise((r) => setTimeout(r, 900));

    const symbols = Array.from(
      new Set(
        body
          .toLowerCase()
          .match(/\b(water|fire|sky|light|dark|house|door|fall|fly|mirror|train|book|garden|ocean|moon|sun|forest)\b/g) ?? [],
      ),
    ).slice(0, 5);

    const dream: Dream = {
      id: `d-${Date.now().toString(36)}`,
      title: title.trim(),
      body: body.trim(),
      emotion,
      vividness,
      date: new Date().toISOString(),
      symbols: symbols.length ? symbols : ["dream"],
      interpretation:
        "Your subconscious left a fingerprint here — keep watching for this pattern over the next few entries.",
    };

    onCreate(dream);
    setSubmitting(false);
    reset();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="fixed left-1/2 top-1/2 z-50 w-[560px] -translate-x-1/2 -translate-y-1/2 glass-strong rounded-2xl p-6"
          >
            {/* Animated aurora rim */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl">
              <div className="absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-nebula-violet to-transparent" />
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-nebula-violet/10 via-transparent to-nebula-cyan/10 blur-xl" />
            </div>

            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/55">
                    <Sparkles size={11} className="text-nebula-violet-soft" />
                    New Dream
                  </div>
                  <h2 className="mt-1.5 font-display text-2xl font-medium tracking-tight">
                    Add a star to your galaxy
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="text-white/45 transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                    Title
                  </label>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="A quiet ocean of glass…"
                    className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus-aurora"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                    Description
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder="What did you see? What did it feel like?"
                    className="mt-1.5 w-full resize-none rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus-aurora"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                    Emotion
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ALL_EMOTIONS.map((e) => {
                      const active = emotion === e;
                      return (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setEmotion(e)}
                          className={`group relative rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                            active
                              ? "border-white/25 bg-white/10 text-white"
                              : "border-white/8 bg-white/[0.02] text-white/65 hover:text-white"
                          }`}
                          style={
                            active
                              ? {
                                  boxShadow: `0 0 0 1px ${EMOTION_COLOR[e]}55, 0 0 18px ${EMOTION_COLOR[e]}55`,
                                }
                              : undefined
                          }
                        >
                          <span
                            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                            style={{
                              background: EMOTION_COLOR[e],
                              boxShadow: `0 0 8px ${EMOTION_COLOR[e]}`,
                            }}
                          />
                          {EMOTION_LABEL[e]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/55">
                    <span>Vividness</span>
                    <span className="font-mono text-white/80">
                      {vividness}/10
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={vividness}
                    onChange={(e) => setVividness(Number(e.target.value))}
                    className="mt-2 h-1 w-full appearance-none rounded-full bg-white/10 accent-nebula-violet"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <NeonButton variant="ghost" onClick={onClose}>
                  Cancel
                </NeonButton>
                <NeonButton
                  glow="violet"
                  disabled={submitting || !title.trim() || !body.trim()}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Generating star…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Add to Galaxy
                    </>
                  )}
                </NeonButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
