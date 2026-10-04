import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DataUpload } from "@/components/company/DataUpload";
import { PrerequisiteNotice } from "@/components/ui/PrerequisiteNotice";
import { CSRF_COOKIE } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: company.data.meta.title,
  description: company.data.meta.description,
};

/**
 * The upload screen. Server-rendered shell, client component for the upload
 * itself.
 *
 * This is the step the funnel stops at after company registration, so it asks for
 * the four report families revenue leakage actually shows up in — sales,
 * marketing, operations, customer success — and accepts any number of them at
 * once. Each file is then confirmed and analysed on its own.
 *
 * The CSRF token is read here and passed down so the client can send it as the
 * `X-CSRF-Token` header. `fetch` generates the multipart boundary itself, so
 * only `Content-Type` is off-limits to us — a custom header is set normally.
 *
 * Without a company record this renders the shared prerequisite notice instead
 * of redirecting to `/company`. A report has to attach to a company to be
 * benchmarked at all, so the requirement is real — it just deserves an
 * explanation rather than a silent bounce.
 */
export default async function DataSourcesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) redirect("/signin");

  const saved = await findCompanyByUserId(user._id);
  const csrfToken = cookieStore.get(CSRF_COOKIE)?.value ?? "";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-8">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-brand uppercase">
          {company.data.page.eyebrow}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {company.data.page.title}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          {company.data.page.subtitle}
        </p>
      </header>

      {saved ? (
        <DataUpload csrfToken={csrfToken} />
      ) : (
        <PrerequisiteNotice
          completedSteps={0}
          body="Every report you share is attached to a company, so we can benchmark it against the right size and revenue range. Add your details first, then come back to share your sales, marketing, operations, and customer success reports."
        />
      )}
    </div>
  );
}
