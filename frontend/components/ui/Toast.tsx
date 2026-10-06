"use client";

import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import type { Toast, ToastVariant } from "@/components/ui/ToastProvider";
import { toasts as toastCopy } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Solid-fill notification stack.
 *
 * Ported from v1.0: one fixed, top-centred column above everything else, each
 * item a solid colour card with a title, an optional one-line description and
 * a Dismiss button, auto-dismissed after five seconds by the provider.
 *
 * The fills are the semantic tokens rather than v1.0's literal `brand-600` /
 * `danger-600`, and the text on them uses the `*-fg` tokens so the pair stays
 * above 4.5:1 in both themes — `--brand` and `--negative` both flip to light
 * hues in dark mode, where white text would collapse to ~2:1.
 *
 * `role="alert"` on errors is announced assertively; success and info sit
 * under `role="status"` so they do not interrupt a screen reader mid-sentence.
 */
const variantStyles: Record<ToastVariant, string> = {
  success: "bg-brand text-brand-fg",
  error: "bg-negative text-negative-fg",
  info: "bg-ink text-ink-fg",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast();

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "toast-item pointer-events-auto flex w-full items-center justify-between gap-4 rounded-tile px-5 py-3.5 shadow-lg",
        variantStyles[toast.variant],
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 truncate text-sm leading-snug opacity-85">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={toastCopy.dismiss}
        className="flex shrink-0 cursor-pointer items-center gap-1 text-xs font-semibold tracking-wide uppercase opacity-80 transition-opacity hover:opacity-100"
      >
        {toastCopy.dismiss}
        <Icon name="close" className="size-4" />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const { toasts } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex flex-col items-center gap-3 px-4"
    >
      <div className="flex w-full flex-col gap-3 sm:max-w-lg">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
}
