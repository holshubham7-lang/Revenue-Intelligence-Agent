"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Error toast shown against the auth form column.
 *
 * `placement="top"` floats it centred at the top edge of the form block;
 * `placement="inline"` drops it into normal flow (used right after the
 * "or continue with your work email" divider). The outer div does any
 * positioning (static, no motion) and the inner `motion.div` does the
 * entrance/exit so the two never fight over `transform`. Auto-dismisses after
 * a beat, and a close button dismisses instantly. Under `prefers-reduced-motion`
 * the animation collapses to zero duration while the message still appears.
 */
export function ErrorToast({
  message,
  onDismiss,
  placement = "top",
}: {
  message: string;
  onDismiss: () => void;
  placement?: "top" | "inline";
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  const wrapper = cn(
    "pointer-events-none w-full max-w-sm",
    placement === "top" &&
      "absolute top-2 left-1/2 z-40 -translate-x-1/2 px-2",
  );

  return (
    <div className={wrapper}>
      <motion.div
        role="alert"
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{
          duration: reduceMotion ? 0 : 0.32,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={cn(
          "pointer-events-auto flex w-full items-start gap-3 rounded-card border border-negative/30 bg-negative-soft p-4 text-negative shadow-xl shadow-black/10",
          placement === "inline" && "mb-5",
        )}
      >
        <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-sm leading-relaxed">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-200 ease-out hover:bg-negative/10"
        >
          <X className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </motion.div>
    </div>
  );
}

/** Hosts a single error toast, animating it in and out. */
export function ErrorToastHost({
  error,
  onDismiss,
  placement = "top",
}: {
  error: string | null;
  onDismiss: () => void;
  placement?: "top" | "inline";
}) {
  return (
    <AnimatePresence>
      {error && (
        <ErrorToast
          key={error}
          message={error}
          onDismiss={onDismiss}
          placement={placement}
        />
      )}
    </AnimatePresence>
  );
}