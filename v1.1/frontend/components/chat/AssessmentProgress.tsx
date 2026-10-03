"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const STEP_MS = 1500;

/**
 * Progress card shown while the agent builds the assessment. Steps advance on a
 * timer as a progress hint — the card is replaced by the result as soon as the
 * request resolves, so the last step is never marked complete on its own.
 */
export function AssessmentProgress({ steps }: { steps: readonly string[] }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, steps.length - 1));
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  const isLast = step === steps.length - 1;
  const progress = isLast ? 90 : (step / steps.length) * 100;

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Sparkles className="size-4 animate-pulse" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="max-w-[85%] rounded-card rounded-bl-md border border-line bg-bg-muted px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-ink">Building your assessment</p>
          <p className="text-xs text-ink-subtle">just a moment…</p>
        </div>

        <ol className="mt-3 space-y-2">
          {steps.map((label, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <li key={label} className="flex items-center gap-2.5">
                <span className="relative flex size-5 shrink-0 items-center justify-center">
                  {isActive ? (
                    <>
                      <span className="animate-thinking-ring absolute inset-0 rounded-full border border-brand" />
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand-soft text-brand">
                        <Sparkles className="size-3" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                    </>
                  ) : isDone ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand text-brand-fg">
                      <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="inline-flex size-5 items-center justify-center rounded-full border border-line-strong bg-bg-inset" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[0.8125rem]",
                    isDone && "font-medium text-brand",
                    isActive && "font-medium text-ink",
                    !isDone && !isActive && "text-ink-subtle",
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className={cn(
              "h-full rounded-full bg-brand transition-all duration-700 ease-out",
              isLast && "animate-pulse",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
