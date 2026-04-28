"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden aurora-bg">
      {/* Drifting nebula blobs — same vocabulary as the galaxy */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-nebula-violet/25 blur-3xl animate-drift" />
        <div
          className="absolute right-[-120px] top-1/2 h-[560px] w-[560px] rounded-full bg-nebula-cyan/20 blur-3xl animate-drift"
          style={{ animationDelay: "-10s" }}
        />
        <div
          className="absolute bottom-[-120px] left-1/3 h-[420px] w-[420px] rounded-full bg-pink-500/15 blur-3xl animate-drift"
          style={{ animationDelay: "-18s" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        className="relative z-10 w-[420px] glass-strong rounded-2xl p-7"
      >
        {/* Animated rim */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl">
          <div className="absolute inset-x-12 -top-px h-px bg-gradient-to-r from-transparent via-nebula-violet to-transparent" />
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-nebula-violet/10 via-transparent to-nebula-cyan/10 blur-xl" />
        </div>

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl glass">
              <span
                aria-hidden
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-nebula-violet/30 via-transparent to-nebula-cyan/30 blur-md"
              />
              <Sparkles
                className="relative z-10 text-white"
                size={16}
                strokeWidth={1.7}
              />
            </span>
            <span className="font-display text-lg font-medium tracking-tight">
              <span className="text-aurora">Aurora</span>
            </span>
          </Link>

          <h1 className="mt-6 font-display text-2xl font-medium tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-sm text-white/55">{subtitle}</p>

          <div className="mt-6">{children}</div>

          <div className="hairline mt-6" />

          <div className="mt-5 text-center text-[13px] text-white/55">
            {footer}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
