import type { Metadata } from "next";
import { cookies } from "next/headers";

import { CompanyDetails } from "@/components/company/CompanyDetails";
import { CompanyForm } from "@/components/company/CompanyForm";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId, toCompanyFormValues } from "@/lib/companies";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: company.meta.title,
  description: company.meta.description,
};

/**
 * Company workspace home. Resolves the signed-in user and their saved company
 * record: with a record on file the profile is shown read-only with an inline
 * edit toggle, and without one the registration form is shown so onboarding
 * completes first. The `/chat` route is reachable from the profile header.
 */
export default async function CompanyPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  const saved = user ? await findCompanyByUserId(user._id) : null;

  const copy = saved ? company.view : company.page;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-8">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-brand uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
          {copy.subtitle}
        </p>
      </header>

      {saved ? (
        <CompanyDetails
          record={{
            values: toCompanyFormValues(saved),
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            hasAssessment: Boolean(saved.assessment),
          }}
        />
      ) : (
        <CompanyForm />
      )}
    </div>
  );
}
