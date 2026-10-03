"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2, Target, TriangleAlert, User } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/api/csrf-client";
import { company } from "@/lib/content";

/**
 * Questions, then the action plan.
 *
 * One component owns both steps because the questions exist to produce the plan —
 * splitting them across routes would mean re-fetching and re-deriving the same
 * state, and a user who lands back on the questions would lose their answers.
 *
 * Answers are held in component state and posted once. They are never persisted
 * to the knowledge base: the plan is built from them, and only system-authored
 * text is indexed.
 */

type Action = {
  id: string;
  title: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  owner: string;
  dueDays: number;
  metric: string;
  expectedImpact: string;
};

type Plan = {
  id: string;
  version: number;
  status: string;
  diagnosis: string;
  actions: Action[];
  projectedImpact: { summary: string };
  profileSummary: string | null;
  indexed: boolean;
  createdAt: string;
};

const PRIORITY_STYLES: Record<Action["priority"], string> = {
  high: "bg-negative-soft text-negative",
  medium: "bg-warning-soft text-warning",
  low: "bg-bg-muted text-ink-muted",
};

export function ActionPlanFlow({
  initialQuestions,
  initialPlan,
  hadData,
  dataset,
  readOnly = false,
  questionsError: initialQuestionsError,
}: {
  initialQuestions: string[];
  initialPlan: Plan | null;
  hadData: boolean;
  /** Hides the regenerate control when the plan is being shown as a view only. */
  readOnly?: boolean;
  /** What the questions were grounded on, shown so the link to the data is visible. */
  dataset?: {
    fileCount: number;
    fileNames: string[];
    valid: boolean;
    caveats: string[];
  };
  /** Set when question generation failed, so a retry can be offered. */
  questionsError?: string | null;
}) {
  const router = useRouter();

  const [questions] = useState<string[]>(initialQuestions);
  const [answers, setAnswers] = useState<string[]>(() => initialQuestions.map(() => ""));
  const [plan, setPlan] = useState<Plan | null>(initialPlan);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(initialQuestionsError ?? null);
  const [retrying, setRetrying] = useState(false);

  const generate = useCallback(
    async (withAnswers: string[]) => {
      setBusy(true);
      setError(null);
      try {
        const res = await postJson("/api/company/action-plan", {
          questions,
          answers: withAnswers,
        });
        const body = (await res.json()) as { plan?: Plan; error?: { message?: string } };
        if (!body.plan) throw new Error(body.error?.message ?? company.plan.errors.generic);

        setPlan(body.plan);
        // The server advanced the stage; a refresh should show the plan, not the
        // questions it was just generated from.
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : company.plan.errors.network);
      } finally {
        setBusy(false);
      }
    },
    [questions, router],
  );

  /**
   * Re-runs question generation from the same stored context.
   *
   * A `router.refresh()` re-runs the server component, which re-issues the model
   * call against the same stored analyses — so a retry asks the engine again
   * without re-uploading or re-analysing anything.
   *
   * Declared above the early returns so the hook order stays stable across the
   * plan / questions / error views.
   */
  const retryQuestions = useCallback(() => {
    setRetrying(true);
    setQuestionsError(null);
    router.refresh();
  }, [router]);

  /* ---------------------------------------------------------------------- */
  /* Plan view                                                               */
  /* ---------------------------------------------------------------------- */

  if (plan) {
    return (
      <div className="space-y-6">
        <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
          <p className="text-xs tracking-wide text-ink-subtle uppercase">
            {company.plan.page.eyebrow} · v{plan.version}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink">
            {company.plan.plan.actionsLabel}
          </h2>

          {plan.diagnosis ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink">
                {company.plan.plan.diagnosisLabel}
              </h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{plan.diagnosis}</p>
            </div>
          ) : null}

          <ol className="mt-6 space-y-4">
            {plan.actions.map((action, index) => (
              <li key={action.id} className="rounded-control border border-line bg-bg p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h4 className="flex items-start gap-2.5 font-display text-base font-bold text-ink">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                      {index + 1}
                    </span>
                    {action.title}
                  </h4>
                  <span
                    className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[action.priority]}`}
                  >
                    {company.plan.plan.priority[action.priority]}
                  </span>
                </div>

                {action.rationale ? (
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{action.rationale}</p>
                ) : null}

                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  {action.owner ? (
                    <div className="flex items-center gap-1.5 text-ink-muted">
                      <User className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <dt className="sr-only">{company.plan.plan.ownerLabel}</dt>
                      <dd>{action.owner}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5 text-ink-muted">
                    <CalendarClock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <dt className="sr-only">{company.plan.plan.dueLabel}</dt>
                    <dd>
                      {company.plan.plan.dueLabel} {action.dueDays}d
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5 text-ink-muted">
                    <Target className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <dd>{company.plan.plan.effort[action.effort]}</dd>
                  </div>
                </dl>

                {action.metric ? (
                  <p className="mt-3 rounded-control bg-bg-muted px-3 py-2 text-xs text-ink-muted">
                    <span className="font-semibold text-ink">
                      {company.plan.plan.metricLabel}:
                    </span>{" "}
                    {action.metric}
                  </p>
                ) : null}

                {action.expectedImpact ? (
                  <p className="mt-2 text-xs text-ink-subtle">
                    <span className="font-semibold">{company.plan.plan.impactLabel}:</span>{" "}
                    {action.expectedImpact}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>

          {plan.projectedImpact?.summary ? (
            <div className="mt-6 rounded-control border border-brand/20 bg-brand-soft p-4">
              <h3 className="text-sm font-semibold text-brand">{company.plan.plan.impactLabel}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {plan.projectedImpact.summary}
              </p>
            </div>
          ) : null}

          <p className="mt-5 flex items-start gap-2 text-xs text-ink-subtle">
            {plan.indexed ? (
              <>
                <Check className="mt-0.5 size-3.5 shrink-0 text-brand" strokeWidth={2.5} aria-hidden="true" />
                {company.plan.plan.indexedNote}
              </>
            ) : (
              company.plan.plan.notIndexedNote
            )}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => router.push("/chat")}>
              {company.plan.plan.openChat}
            </Button>
            {readOnly ? null : (
              <Button variant="ghost" disabled={busy} onClick={() => void generate(answers)}>
                {busy ? company.plan.questions.submitting : company.plan.plan.regenerate}
              </Button>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Questions view                                                          */
  /* ---------------------------------------------------------------------- */

  const answered = answers.filter((a) => a.trim().length > 0).length;
  const allAnswered = questions.length > 0 && answered === questions.length;

  /**
   * Re-runs question generation from the same stored context.
   *
   * A `router.refresh()` re-runs the server component, which re-issues the model
   * call against the same stored analyses — so a retry asks the engine again
   * without re-uploading or re-analysing anything.
   */
  /* No questions and no error would render an empty box with a dead submit
     button, so that combination is unreachable by construction. */
  if (questions.length === 0 && questionsError) {
    return (
      <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">
          {company.plan.questions.unavailableTitle}
        </h2>
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-control border border-warning/30 bg-warning-soft p-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm text-ink">
            {company.plan.questions.unavailableBody}
            {hadData ? ` ${company.plan.questions.yourDataIsSaved}` : ""}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={retrying} onClick={retryQuestions}>
            {retrying ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {company.plan.questions.retrying}
              </>
            ) : (
              company.plan.questions.retry
            )}
          </Button>
          {hadData ? (
            <Button variant="ghost" disabled={retrying} onClick={() => router.push("/data")}>
              {company.plan.questions.backToData}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
      <h2 className="font-display text-lg font-bold text-ink">
        {company.plan.page.withData && hadData
          ? company.plan.page.withData
          : company.plan.page.withoutData}
      </h2>

      {dataset && dataset.fileCount > 0 ? (
        <p className="mt-2 text-xs text-ink-subtle">
          {dataset.fileCount === 1
            ? `Based on ${dataset.fileNames[0]}`
            : `Based on ${dataset.fileCount} reports: ${dataset.fileNames.join(", ")}`}
        </p>
      ) : null}

      <div className="mt-5 space-y-5">
        {questions.map((question, index) => (
          <label key={question} className="block">
            <span className="flex gap-2.5 text-sm font-medium text-ink">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                {index + 1}
              </span>
              {question}
            </span>
            <textarea
              value={answers[index] ?? ""}
              onChange={(e) => {
                const next = [...answers];
                next[index] = e.target.value;
                setAnswers(next);
              }}
              disabled={busy}
              rows={2}
              placeholder={company.plan.questions.placeholder}
              maxLength={4000}
              className="mt-2 w-full resize-y rounded-control border border-line bg-bg px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-subtle focus-visible:border-brand focus-visible:outline-2 disabled:opacity-60"
            />
          </label>
        ))}
      </div>

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
        <Button
          variant="primary"
          disabled={busy || !allAnswered}
          onClick={() => void generate(answers)}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {company.plan.questions.submitting}
            </>
          ) : (
            company.plan.questions.submit
          )}
        </Button>

        {hadData ? (
          <Button variant="ghost" disabled={busy} onClick={() => void generate([])}>
            {company.plan.questions.skip}
          </Button>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-ink-subtle">
        {answered} of {questions.length} answered
      </p>
    </section>
  );
}
