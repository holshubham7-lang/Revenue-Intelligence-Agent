import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warning";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm",
  secondary:
    "border border-line-strong bg-surface-soft text-ink hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700",
  ghost: "text-ink-muted hover:bg-surface-soft hover:text-ink",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 shadow-sm",
  warning:
    "bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-[0.875rem]",
};

const base =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold tracking-[-0.01em] transition-colors duration-200 select-none disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}