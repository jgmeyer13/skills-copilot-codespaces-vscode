"use client";

import { motion, AnimatePresence } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const initial = (session?.user?.name || session?.user?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 flex h-10 w-10 items-center justify-center rounded-xl glass text-xs font-semibold text-white/85 transition-colors hover:text-white focus-aurora"
        aria-label="Account menu"
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-[240px] glass-strong rounded-xl p-2"
          >
            <div className="rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/45">
                <Sparkles size={10} className="text-nebula-violet-soft" />
                Signed in
              </div>
              <div className="mt-1 truncate text-sm text-white">
                {session?.user?.name || session?.user?.email || "Anonymous"}
              </div>
              {session?.user?.name && session?.user?.email && (
                <div className="truncate text-[11px] text-white/45">
                  {session.user.email}
                </div>
              )}
            </div>

            <div className="hairline my-1" />

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
