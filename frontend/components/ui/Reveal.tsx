"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal wrapper.
 *
 * Animates opacity + a short vertical offset into view once, then stops
 * animating. Under `prefers-reduced-motion` the content renders in its final
 * state immediately with no transform, so nothing moves for users who asked for
 * stillness.
 *
 * Kept deliberately minimal: one property group, short distance, ease-out —
 * motion should confirm arrival, not perform.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Seconds. Use 0.06–0.09 increments to stagger a list. */
  delay?: number;
  as?: "div" | "li" | "section" | "article";
}) {
  const reduceMotion = useReducedMotion();
  const Cmp = motion[as];

  if (reduceMotion) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Cmp
      className={cn(className)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Cmp>
  );
}
