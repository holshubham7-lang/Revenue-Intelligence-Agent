"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

type ProcessingStep = {
  icon: IconName;
  label: string;
};

const STEPS: ProcessingStep[] = [
  { icon: "search", label: "Reviewing your answers" },
  { icon: "layers", label: "Mapping revenue signals" },
  { icon: "chart", label: "Analyzing your business" },
  { icon: "action", label: "Generating your assessment" },
];

const STEP_MS = 1600;

export function AgentProcessing() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  const isLast = step === STEPS.length - 1;
  const progress = isLast ? 90 : (step / STEPS.length) * 100;

  return (
    <div className="animate-message-enter flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-200/60">
        <Icon name="spark" size={16} />
      </span>
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-4">
        <div className="flex items-center gap-2">
          <Icon
            name="spark"
            size={14}
            className={cn(
              "text-brand-600",
              isLast ? "animate-pulse-soft" : "animate-pulse-soft",
            )}
          />
          <p className="text-sm font-semibold text-ink">
            Building your assessment
          </p>
          <p className="text-xs text-ink-faint">just a moment…</p>
        </div>

        <ul className="mt-3 space-y-2">
          {STEPS.map((item, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <li key={item.label} className="flex items-center gap-2.5">
                <span className="relative flex size-6 shrink-0 items-center justify-center">
                  {isActive ? (
                    <>
                      <span className="animate-thinking-ring absolute inset-0 rounded-full border border-brand-400" />
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-200/60">
                        <Icon name={item.icon} size={13} />
                      </span>
                    </>
                  ) : isDone ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Icon name="check" size={13} />
                    </span>
                  ) : (
                    <span className="flex size-6 items-center justify-center rounded-full bg-surface text-ink-faint ring-1 ring-line-strong">
                      <Icon name={item.icon} size={13} />
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[0.8125rem]",
                    isDone
                      ? "font-medium text-brand-700"
                      : isActive
                        ? "font-medium text-ink"
                        : "text-ink-faint",
                  )}
                >
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className={cn(
              "h-full rounded-full bg-brand-500 transition-all duration-700 ease-out",
              isLast && "animate-pulse-soft",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}