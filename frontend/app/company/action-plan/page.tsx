import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ActionPlanFlow } from "@/components/company/ActionPlanFlow";
import { GenerateActionPlan } from "@/components/company/GenerateActionPlan";
import { Markdown } from "@/components/chat/Markdown";
import { ButtonLink } from "@/components/ui/Button";
import { PrerequisiteNotice } from "@/components/ui/PrerequisiteNotice";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { company } from "@/lib/content";
import { latestActionPlan } from "@/lib/data/pipeline";

export const metadata: Metadata = {
  title: company.plan.meta.title,
  description: company.plan.meta.description,
};

/**
 * The action plan, shown for reading only.
 *
 * The questions that used to live here now run in the chat interview, so this
 * page renders the result: the structured plan when a company has one from the
 * older data-first funnel, otherwise the assessment the interview produced.
 * Nothing here re-interviews — the chat is where the interview is built.
 *
 * There is one thing on this page that does write, and it is deliberate: a
 * company holding only an assessment is offered the action plan and can take it
 * or leave it. A plan is a committed list of work, so it is never produced
 * without being asked for, and an unasked plan would look identical to an
 * accepted one.
 *
 * Without a company record this shows the shared prerequisite notice rather
 * than redirecting, for the same reason as the other gated routes.
 */
export default async function ActionPlanPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) redirect("/signin");

  const saved = await findCompanyByUserId(user._id);

  if (!saved) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PrerequisiteNotice
          completedSteps={0}
          body="Your action plan is built around a specific company — its stage mix and revenue range decide which levers we recommend. Add your details first."
        />
      </div>
    );
  }

  const existing = await latestActionPlan(saved._id);
  const hasPlan = Boolean(existing || saved.assessment);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-8">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-brand uppercase">
          {company.plan.page.eyebrow}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {company.plan.plan.actionsLabel}
        </h1>
        {!hasPlan ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            {company.plan.page.subtitle}
          </p>
        ) : null}
      </header>

      {existing ? (
        <ActionPlanFlow
          initialQuestions={[]}
          initialPlan={{
            id: existing._id,
            version: existing.version,
            status: existing.status,
            diagnosis: existing.diagnosis,
            actions: existing.actions,
            projectedImpact: existing.projectedImpact,
            profileSummary: existing.profileSummary ?? null,
            indexed: Boolean(existing.kb),
            createdAt: existing.createdAt,
          }}
          hadData={false}
          readOnly
        />
      ) : saved.assessment ? (
        <div className="space-y-6">
          <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
            <div className="text-[0.9375rem] leading-relaxed text-ink-muted">
              <Markdown content={saved.assessment.result} />
            </div>
            <div className="mt-6">
              <ButtonLink href="/chat" variant="primary">
                {company.plan.plan.openChat}
              </ButtonLink>
            </div>
          </section>
          {/* The assessment is a read on the business; a plan is committed work.
              It is offered here and built only if this button is pressed. */}
          <GenerateActionPlan />
        </div>
      ) : (
        <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">No plan yet</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            Your plan is built from a short interview with your agent. Answer a few
            questions and it will appear here.
          </p>
          <div className="mt-6">
            <ButtonLink href="/chat" variant="primary">
              Start the chat
            </ButtonLink>
          </div>
        </section>
      )}
    </div>
  );
}
