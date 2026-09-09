import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "@/components/ui/ProviderLogo";

type Tone = "neutral" | "brand" | "success" | "danger" | "warn";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-soft text-ink-muted ring-1 ring-line",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-1 ring-success-100",
  danger: "bg-danger-50 text-danger-700 ring-1 ring-danger-100",
  warn: "bg-accent-50 text-accent-600 ring-1 ring-accent-100",
};

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email",
  google: "Google",
  microsoft: "Microsoft",
  linkedin: "LinkedIn",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-[-0.01em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8125rem] font-medium text-ink">
      <ProviderLogo provider={provider} size={16} />
      {PROVIDER_LABELS[provider] ?? provider}
    </span>
  );
}