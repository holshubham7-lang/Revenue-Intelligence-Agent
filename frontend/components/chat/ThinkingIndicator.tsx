"use client";

import { useEffect, useState } from "react";

type ThinkingIndicatorProps = {
  /** Ordered phase labels; the last one is held until the answer arrives. */
  phases: readonly string[];
  /** Delay in ms before advancing to the next phase. */
  phaseDelayMs?: number;
};

/**
 * Assistant "thinking" row: an animated waveform, the current phase, and an
 * elapsed-seconds counter. Phases are only a progress hint — the answer can
 * arrive at any point, so the last phase never auto-completes.
 */
export function ThinkingIndicator({
  phases,
  phaseDelayMs = 1400,
}: ThinkingIndicatorProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const timers = phases.map((_, i) => setTimeout(() => setPhaseIndex(i), i * phaseDelayMs));
    return () => timers.forEach(clearTimeout);
  }, [phases, phaseDelayMs]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = phases[Math.min(phaseIndex, phases.length - 1)];

  return (
    <div className="flex justify-start">
      <div
        className={
          visible
            ? "rounded-card rounded-bl-md border border-line bg-bg-muted px-4 py-2.5 opacity-100 transition-all duration-300"
            : "translate-y-1.5 rounded-card rounded-bl-md border border-line bg-bg-muted px-4 py-2.5 opacity-0 transition-all duration-300"
        }
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="block h-4 w-[3px] origin-center animate-waveform rounded-full bg-brand"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>
          <span className="whitespace-nowrap text-sm font-medium text-ink">{label}</span>
          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-xs tabular-nums text-brand-soft-fg">
            {elapsed}s
          </span>
        </div>
      </div>
    </div>
  );
}
