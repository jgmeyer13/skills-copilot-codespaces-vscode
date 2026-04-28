import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  strong?: boolean;
};

export const GlassCard = forwardRef<HTMLDivElement, Props>(
  ({ className, strong, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-2xl",
        className,
      )}
      {...rest}
    />
  ),
);
GlassCard.displayName = "GlassCard";
