import { Building2, Database, LockKeyhole, Target, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { company } from "@/lib/content";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, LucideIcon> = {
  building: Building2,
  database: Database,
  target: Target,
};

/**
 * The one notice every company-gated route shows in place of a silent redirect.
 *
 * `/chat`, `/data`, and `/company/action-plan` all need a company
 * record. Each used to `redirect("/company")` when one was missing, so a
 * sidebar click looked like it simply did nothing — no explanation of why the
 * route was unavailable, and no way back to where they were. This states the
 * requirement in place and links straight at the step that satisfies it.
 *
 * A step renders as a link only when it is the next unmet requirement; every
 * step after that is shown as locked with the reason, so the chain is visible
 * without pretending a route is open when it isn't.
 *
 * Amber rather than brand green on purpose: green is this product's "all good"
 * colour, and a green card reads as a positive confirmation instead of a
 * blocked route. Contrast note — `--accent` is 3.19:1 on white, so it carries
 * icons and large glyphs only; all body text uses `--ink*` or `--accent-soft-fg`
 * (6.4:1 on `--accent-soft`) to clear 4.5:1.
 */
export function PrerequisiteNotice({
  completedSteps,
  title,
  body,
  className,
}: {
  /**
   * How many leading steps the user has already satisfied. The step at this
   * index is the next one to do and carries the CTA; anything beyond it is
   * locked. This is a count of *done* steps, not reachable ones — `0` means
   * "nothing done yet", which must leave step 1 open or the notice deadlocks.
   */
  completedSteps: number;
  title?: string;
  body?: string;
  className?: string;
}) {
  const copy = company.prerequisite;
  // Show the next step plus one locked step: enough to convey the chain
  // without dumping the entire funnel on a user who only needs step 1.
  const steps = copy.steps.slice(0, Math.min(completedSteps + 2, copy.steps.length));

  return (
    <section
      aria-labelledby="prerequisite-title"
      className={cn(
        "rounded-card border border-accent/40 bg-accent-soft shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-4 border-b border-accent/25 p-5 sm:p-6">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-bg-elevated text-accent shadow-sm">
          <TriangleAlert className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.12em] text-accent-soft-fg uppercase">
            <LockKeyhole className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h1
            id="prerequisite-title"
            className="mt-1.5 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl"
          >
            {title ?? copy.title}
          </h1>
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
            {body ?? copy.body}
          </p>
        </div>
      </div>

      <ol className="divide-y divide-accent/20">
        {steps.map((step, index) => {
          const IconCmp = STEP_ICONS[step.icon];
          const reachable = index === completedSteps;

          return (
            <li
              key={step.title}
              className={cn(
                "flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:p-6",
                reachable ? "bg-bg-elevated/50" : "bg-transparent",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-control",
                  reachable
                    ? "bg-bg-elevated text-brand shadow-sm"
                    : "bg-accent-soft text-ink-subtle",
                )}
              >
                {IconCmp ? (
                  <IconCmp className="size-5" strokeWidth={1.75} aria-hidden="true" />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-ink">
                  <span className="font-mono text-xs text-ink-subtle">
                    Step {index + 1}.{" "}
                  </span>
                  {step.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>

                {!reachable ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-soft-fg">
                    <LockKeyhole className="size-3" strokeWidth={2.25} aria-hidden="true" />
                    {copy.pendingLabel}
                    <span className="font-normal normal-case text-ink-muted">
                      — {copy.pendingHint.toLowerCase()}
                    </span>
                  </p>
                ) : null}
              </div>

              {reachable ? (
                <ButtonLink
                  href={step.href}
                  variant="primary"
                  size="md"
                  className="w-full shrink-0 sm:w-auto"
                >
                  {step.cta}
                </ButtonLink>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="border-t border-accent/25 px-5 py-4 text-xs leading-relaxed text-ink-subtle sm:px-6">
        {copy.footnote}
      </p>
    </section>
  );
}