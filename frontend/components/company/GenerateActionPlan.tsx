"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { postJson } from "@/lib/api/csrf-client";
import { company } from "@/lib/content";

/**
 * The opt-in step between the assessment and the action plan.
 *
 * Answering the interview asks for an assessment, so one is written as soon as
 * the last answer lands. An action plan is a different thing — a committed,
 * prioritised list of work with owners and dates — and committing someone to
 * that is not something to do on their behalf. So the plan is never generated
 * automatically: this panel is the only place the offer is made, and its button
 * is the only route from an assessment to a plan.
 *
 * The request carries no questions and no answers. The interview is already on
 * the company record, and the server reads it from there, so the answers a user
 * typed never have to be handed back to the browser to be used a second time.
 *
 * There is deliberately a way to decline as well as a way to accept: a user who
 * wants to keep asking their agent first should not have to dismiss the offer.
 */
export function GenerateActionPlan() {
  const router = useRouter();
  const copy = company.plan.generate;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("/api/company/action-plan", {});
      const body = (await res.json()) as { plan?: unknown; error?: { message?: string } };
      if (!body.plan) throw new Error(body.error?.message ?? copy.error);

      /* The server saved the plan and advanced onboarding to `plan_ready`, so a
         refresh renders the plan itself instead of this offer. */
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.error);
    } finally {
      setBusy(false);
    }
  }, [copy.error, router]);

  return (
    <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
      <h2 className="font-display text-lg font-bold text-ink">{copy.title}</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{copy.body}</p>

      {error ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-control border border-negative/30 bg-negative-soft p-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-negative" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm text-negative">{error}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={() => void generate()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy.submitting}
            </>
          ) : (
            copy.cta
          )}
        </Button>
        <ButtonLink href="/chat" variant="ghost">
          {copy.decline}
        </ButtonLink>
      </div>
    </section>
  );
}