"use client";

import { motion } from "framer-motion";
import { Search, Bell, Plus, Download, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { NeonButton } from "@/components/ui/neon-button";
import { UserMenu } from "@/components/layout/user-menu";

type Props = {
  onNewDream: () => void;
  onExport: () => Promise<void> | void;
};

type ExportStatus = "idle" | "saving" | "done" | "error";

export function Topbar({ onNewDream, onExport }: Props) {
  const [status, setStatus] = useState<ExportStatus>("idle");

  async function handleExport() {
    if (status === "saving") return;
    setStatus("saving");
    try {
      await onExport();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2400);
    }
  }

  return (
    <header className="z-30 flex w-full items-center justify-between gap-4 px-6 pt-5">
      <div className="flex items-center gap-3">
        <motion.h1
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-display text-lg font-medium tracking-tight"
        >
          <span className="text-aurora">Aurora</span>
          <span className="ml-2 text-white/50 text-sm font-normal">
            / Dream Galaxy
          </span>
        </motion.h1>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="glass flex h-10 w-full max-w-md items-center gap-2 rounded-xl px-3"
        >
          <Search size={15} className="text-white/40" />
          <input
            placeholder="Search dreams, symbols, emotions…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/40 sm:inline">
            ⌘K
          </kbd>
        </motion.div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={status === "saving"}
          aria-label="Export wallpaper"
          title="Export your galaxy as a wallpaper"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl glass text-white/70 transition-colors hover:text-white focus-aurora disabled:opacity-70"
        >
          {status === "saving" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : status === "done" ? (
            <Check
              size={16}
              className="text-nebula-lime"
              style={{ filter: "drop-shadow(0 0 6px rgba(74,222,128,0.7))" }}
            />
          ) : (
            <Download size={16} />
          )}
          {status === "error" && (
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
          )}
        </button>

        <button
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl glass text-white/70 transition-colors hover:text-white focus-aurora"
        >
          <Bell size={16} />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-nebula-violet shadow-glow-violet" />
        </button>

        <NeonButton onClick={onNewDream} glow="violet">
          <Plus size={15} />
          New Dream
        </NeonButton>

        <UserMenu />
      </div>
    </header>
  );
}
