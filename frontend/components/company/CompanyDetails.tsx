"use client";

import { useState } from "react";
import { CircleCheck, Pencil } from "lucide-react";

import { CompanyForm } from "@/components/company/CompanyForm";
import { Button } from "@/components/ui/Button";
import type { CompanyFormValues } from "@/lib/contracts";
import { company } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Everything the profile view needs, resolved on the server and passed down. */
export type CompanyRecord = {
  /** Saved field values, pre-mapped to the all-strings form shape. */
  values: CompanyFormValues;
  createdAt: string;
  updatedAt: string;
  hasAssessment: boolean;
};

type Row = {
  label: string;
  /** `null` renders the "not provided" placeholder. */
  value: string | null;
  /** Rendered as an outbound link. */
  href?: string;
  /** Full-width row, for long-form values like the problem statement. */
  wide?: boolean;
  /** Rendered as a status pill instead of plain text. */
  status?: "complete" | "pending";
};

/**
 * `en-GB` pinned to UTC so the server render and the client hydration agree —
 * a local-timezone format here would produce a hydration mismatch.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * The saved company profile at `/company` — the read view plus an inline edit
 * toggle. Rendered by the server page once a company record exists; the
 * registration form is what users see before that.
 *
 * Editing reuses `CompanyForm` in `edit` mode against the same upserting
 * `/api/companies` endpoint, so there is one markup and one save path.
 */
export function CompanyDetails({ record }: { record: CompanyRecord }) {
  const [editing, setEditing] = useState(false);

  const { view, form } = company;
  const { values } = record;

  const website = values.website.trim();
  /* A saved website may be a bare domain, which is not a usable href as-is. */
  const websiteHref = website
    ? /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`
    : null;

  const rows: Row[] = [
    { label: form.companyName.label, value: values.companyName },
    { label: form.companyType.label, value: values.companyType || null },
    { label: form.website.label, value: website, href: websiteHref ?? undefined },
    { label: form.phone.label, value: values.phone || null },
    { label: form.industry.label, value: values.industry || null },
    { label: form.companySize.label, value: values.companySize || null },
    { label: form.country.label, value: values.country || null },
    { label: form.state.label, value: values.state || null },
    { label: form.city.label, value: values.city || null },
    { label: form.revenueRange.label, value: values.revenueRange || null },
    { label: form.problem.label, value: values.problem || null, wide: true },
    { label: view.createdLabel, value: formatDate(record.createdAt) || null },
    { label: view.updatedLabel, value: formatDate(record.updatedAt) || null },
    {
      label: view.assessmentLabel,
      value: record.hasAssessment ? view.assessmentComplete : view.assessmentPending,
      status: record.hasAssessment ? "complete" : "pending",
    },
  ];

  if (editing) {
    return (
      <CompanyForm
        mode="edit"
        initialValues={values}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="overflow-hidden rounded-card border border-line bg-bg-elevated shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <p className="font-display text-base font-bold tracking-tight text-ink">
            {values.companyName}
          </p>
          <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {view.editLabel}
          </Button>
        </div>

        <dl className="divide-y divide-line">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "grid gap-1 px-6 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6",
                row.wide && "sm:grid-cols-1 sm:gap-1.5",
              )}
            >
              <dt className="text-sm font-semibold text-ink-muted">{row.label}</dt>
              <dd
                className={cn(
                  "min-w-0 text-[0.9375rem] leading-relaxed text-ink",
                  !row.value && "text-ink-subtle",
                  row.wide && "whitespace-pre-wrap",
                )}
              >
                {!row.value ? (
                  view.notProvided
                ) : row.status === "complete" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1 text-xs font-semibold text-positive">
                    <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    {row.value}
                  </span>
                ) : row.status === "pending" ? (
                  <span className="inline-flex items-center rounded-full bg-bg-muted px-3 py-1 text-xs font-semibold text-ink-muted">
                    {row.value}
                  </span>
                ) : row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-words font-medium text-brand underline decoration-brand/40 underline-offset-2 transition-colors duration-200 ease-out hover:decoration-brand"
                  >
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
