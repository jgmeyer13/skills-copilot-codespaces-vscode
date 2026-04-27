"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { forwardRef, type ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline";

type Props = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  glow?: "violet" | "cyan" | "lime";
  children?: ReactNode;
};

const glowMap = {
  violet: "shadow-glow-violet hover:shadow-glow-violet",
  cyan: "shadow-glow-cyan hover:shadow-glow-cyan",
  lime: "shadow-glow-lime hover:shadow-glow-lime",
} as const;

export const NeonButton = forwardRef<HTMLButtonElement, Props>(
  (
    { className, variant = "primary", glow = "violet", children, ...rest },
    ref,
  ) => {
    const base =
      "relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium tracking-wide transition-colors focus-aurora select-none";

    const variantClasses: Record<Variant, string> = {
      primary: cn(
        "text-white",
        "bg-gradient-to-b from-white/10 to-white/[0.02]",
        "border border-white/10",
        glowMap[glow],
      ),
      ghost:
        "text-white/80 hover:text-white hover:bg-white/[0.04] border border-transparent",
      outline:
        "text-white/90 border border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
    };

    return (
      <motion.button
        ref={ref}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
        className={cn(base, variantClasses[variant], className)}
        {...rest}
      >
        {variant === "primary" && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-nebula-cyan/20 via-nebula-violet/20 to-nebula-cyan/20 opacity-60 blur-md"
          />
        )}
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </motion.button>
    );
  },
);
NeonButton.displayName = "NeonButton";
