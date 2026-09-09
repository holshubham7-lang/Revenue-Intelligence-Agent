"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PHASES = [
  { text: "Thinking", delay: 0 },
  { text: "Preparing response", delay: 1400 },
] as const;

export function ThinkingIndicator() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const timers = PHASES.map((phase, i) =>
      setTimeout(() => setPhaseIndex(i), phase.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-2.5",
          "transition-all duration-300",
          visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-1.5",
        )}
      >
        <div className="flex items-center gap-3">
          {/* Waveform visualizer */}
          <div
            className="flex items-center gap-[3px]"
            aria-hidden="true"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="block w-[3px] rounded-full bg-brand-400 animate-waveform"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>

          {/* Phase label */}
          <span className="whitespace-nowrap text-sm font-medium text-ink">
            {PHASES[phaseIndex].text}
          </span>

          {/* ChatGPT-style elapsed seconds */}
          <span
            className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs tabular-nums text-brand-700 tabular"
          >
            {elapsed}s
          </span>
        </div>
      </div>
    </div>
  );
}
