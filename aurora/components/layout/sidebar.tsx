"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  Moon,
  Compass,
  BookOpen,
  Stars,
  Settings,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type GalaxyMode = "galaxy" | "constellations";

const items = [
  { icon: Stars, label: "Galaxy", id: "galaxy" as const, mode: "galaxy" as GalaxyMode },
  { icon: Moon, label: "Dreams", id: "dreams" as const, mode: null },
  { icon: Brain, label: "Insights", id: "insights" as const, mode: null },
  { icon: BookOpen, label: "Journal", id: "journal" as const, mode: null },
  { icon: Compass, label: "Constellations", id: "const" as const, mode: "constellations" as GalaxyMode },
];

type Props = {
  mode: GalaxyMode;
  onModeChange: (m: GalaxyMode) => void;
};

export function Sidebar({ mode, onModeChange }: Props) {
  // Visual active state — for the wired modes it follows `mode`; for
  // unwired items it toggles only locally so the UI feels responsive
  // while we build out those views.
  const wiredId = mode === "constellations" ? "const" : "galaxy";
  const [visualActive, setVisualActive] = useState<string>(wiredId);
  // Keep visual active in sync if mode changes from outside.
  if (visualActive !== wiredId && (visualActive === "galaxy" || visualActive === "const")) {
    // no-op; allow user to keep visual selection on unwired items
  }

  function handleClick(id: string, navMode: GalaxyMode | null) {
    setVisualActive(id);
    if (navMode) onModeChange(navMode);
  }

  return (
    <aside className="z-30 flex h-full w-[72px] flex-col items-center justify-between py-5">
      <div className="flex flex-col items-center gap-3">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl glass-strong"
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-nebula-violet/30 via-transparent to-nebula-cyan/30 blur-md"
          />
          <Sparkles
            className="relative z-10 text-white"
            size={20}
            strokeWidth={1.6}
          />
        </motion.div>

        <div className="hairline my-1 w-8" />

        <nav className="flex flex-col items-center gap-1.5">
          {items.map(({ icon: Icon, label, id, mode: navMode }) => {
            const isActive = visualActive === id;
            return (
              <button
                key={id}
                onClick={() => handleClick(id, navMode)}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus-aurora",
                  isActive
                    ? "text-white"
                    : "text-white/55 hover:text-white",
                )}
                aria-label={label}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-xl glass border border-white/10"
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  />
                )}
                <Icon size={18} strokeWidth={1.7} className="relative z-10" />

                <span className="pointer-events-none absolute left-[58px] z-20 whitespace-nowrap rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[11px] font-medium text-white/90 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <button
        className="flex h-11 w-11 items-center justify-center rounded-xl text-white/55 transition-colors hover:text-white focus-aurora"
        aria-label="Settings"
      >
        <Settings size={18} strokeWidth={1.7} />
      </button>
    </aside>
  );
}
