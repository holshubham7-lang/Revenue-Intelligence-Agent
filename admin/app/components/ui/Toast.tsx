"use client";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type { Toast, ToastVariant } from "@/components/ui/ToastProvider";

const variantStyles: Record<ToastVariant, string> = {
  success: "bg-brand-600 text-white",
  error: "bg-danger-600 text-white",
  info: "bg-ink text-white",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast();

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "toast-item pointer-events-auto flex w-full items-center justify-between gap-4 rounded-xl px-5 py-3.5 shadow-lg",
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
        aria-label="Dismiss notification"
        className="flex shrink-0 cursor-pointer items-center gap-1 text-xs font-semibold uppercase tracking-wide text-current opacity-80 transition-opacity hover:opacity-100"
      >
        Dismiss
        <Icon name="close" size={16} />
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