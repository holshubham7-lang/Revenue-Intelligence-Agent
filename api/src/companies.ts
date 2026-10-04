import { ObjectId } from "mongodb";

import { canTransition, type OnboardingStage } from "./data/types";
import { company } from "./content";
import { getDb } from "./db";

/**
 * Company registration for the signed-in user.
 *
 * Pure data + validation here; the API route in
 * `app/api/companies/route.ts` owns the HTTP envelope (CSRF, session) and calls
 * `saveCompanyRegistration` to upsert the one-company-per-user record.
 * Validating against `lib/content.ts` keeps the server's allowed option lists in
 * lock-step with what the form offers.
 */

export type CompanyInput = {
  companyName: string;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  revenueRange: string;
  problem: string | null;
};

export type CompanyField = keyof CompanyInput;

export type CompanyFormResult =
  | { ok: true; data: CompanyInput }
  | { ok: false; fields: Partial<Record<CompanyField, string>> };

/** Shape of a company document in `revops.companies`. */
export type CompanyDoc = CompanyInput & {
  _id: string;
  userId: string;
  /** Explicit funnel position. See `lib/data/types.ts`. */
  onboardingStage?: OnboardingStage;
  /** → `action_plans._id`. A pointer, so the company doc never embeds a plan. */
  actionPlanId?: string;
  /** Legacy — superseded by `action_plans`. Retained for existing records. */
  assessment?: CompanyAssessment;
  createdAt: string;
  updatedAt: string;
};

/**
 * Flat, all-strings shape used to seed the client-side company form.
 * Stored `null`s collapse to `""` so a controlled input is never `null`.
 *
 * Re-exported from `@/lib/contracts` so client components can import the shape
 * without pulling this module — and its `mongodb` import — into the client graph.
 */
export type { CompanyFormValues } from "./contracts";

import type { CompanyFormValues } from "./contracts";

/** Revenue Intelligence assessment produced from the onboarding Q&A. */
export type CompanyAssessment = {
  questions: string[];
  answers: string[];
  result: string;
  createdAt: string;
};

const WORD_LIMIT = company.form.problem.maxWords;
const OPTIONS: Record<"industry" | "companySize" | "revenueRange", readonly string[]> = {
  industry: company.form.industry.options,
  companySize: company.form.companySize.options,
  revenueRange: company.form.revenueRange.options,
};

function strOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isAllowed(value: string | null, allowed: readonly string[]): boolean {
  return value === null || (allowed as readonly string[]).includes(value);
}

/** Validates a raw JSON body against the form's contract (mirrors the client). */
export function validateCompany(raw: unknown): CompanyFormResult {
  const fields: Partial<Record<CompanyField, string>> = {};
  const input =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  const companyName =
    typeof input.companyName === "string" ? input.companyName.trim() : "";
  const website = strOrNull(input.website);
  const country = strOrNull(input.country);
  const problem = strOrNull(input.problem);
  const industry = strOrNull(input.industry);
  const companySize = strOrNull(input.companySize);
  const revenueRange =
    typeof input.revenueRange === "string" ? input.revenueRange.trim() : "";

  if (companyName.length === 0) {
    fields.companyName = "Company name is required.";
  } else if (companyName.length > 200) {
    fields.companyName = "Company name must be 200 characters or fewer.";
  }

  if (website !== null) {
    if (website.length > 2048) {
      fields.website = "Website must be 2048 characters or fewer.";
    } else {
      try {
        const parsed = new URL(website);
        if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
          throw new Error("unsupported scheme");
        }
      } catch {
        fields.website = "Enter a valid website URL (starting with http:// or https://).";
      }
    }
  }

  if (!isAllowed(industry, OPTIONS.industry) || typeof input.industry !== "string") {
    fields.industry = "Pick an industry from the list.";
  }

  if (!isAllowed(companySize, OPTIONS.companySize) || typeof input.companySize !== "string") {
    fields.companySize = "Pick a company size from the list.";
  }

  if (country !== null && country.length > 120) {
    fields.country = "Country must be 120 characters or fewer.";
  }

  if (revenueRange.length === 0) {
    fields.revenueRange = "Annual revenue range is required.";
  } else if (!OPTIONS.revenueRange.includes(revenueRange)) {
    fields.revenueRange = "Pick a revenue range from the list.";
  }

  const wordCount = problem === null ? 0 : problem.split(/\s+/).length;
  if (problem !== null && wordCount > WORD_LIMIT) {
    fields.problem = `Problem must be ${WORD_LIMIT} words or fewer.`;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    data: { companyName, website, industry, companySize, country, revenueRange, problem },
  };
}

let indexEnsured: Promise<unknown> | null = null;

/**
 * One company record per user. The unique index on `userId` makes the upsert
 * race-free (a double-submit can't create two companies), created once per
 * process and a no-op afterwards.
 */
export async function ensureCompaniesIndex(): Promise<void> {
  const db = await getDb();
  await db.collection("companies").createIndex({ userId: 1 }, { unique: true });
}

/** The signed-in user's company record, if any. */
export async function findCompanyByUserId(userId: string): Promise<CompanyDoc | null> {
  const db = await getDb();
  return db.collection<CompanyDoc>("companies").findOne({ userId });
}

/** Maps a stored record to editable form values (nulls become empty fields). */
export function toCompanyFormValues(doc: CompanyDoc): CompanyFormValues {
  return {
    companyName: doc.companyName,
    website: doc.website ?? "",
    industry: doc.industry ?? "",
    companySize: doc.companySize ?? "",
    country: doc.country ?? "",
    revenueRange: doc.revenueRange,
    problem: doc.problem ?? "",
  };
}

/** Upserts the signed-in user's company record, returning the saved doc. */
export async function saveCompanyRegistration(
  userId: string,
  data: CompanyInput,
): Promise<CompanyDoc> {
  if (!indexEnsured) {
    indexEnsured = ensureCompaniesIndex().catch((err) => {
      indexEnsured = null;
      throw err;
    });
  }
  await indexEnsured;

  const db = await getDb();
  const now = new Date().toISOString();

  const doc = await db.collection<CompanyDoc>("companies").findOneAndUpdate(
    { userId },
    {
      $set: {
        companyName: data.companyName,
        website: data.website,
        industry: data.industry,
        companySize: data.companySize,
        country: data.country,
        revenueRange: data.revenueRange,
        problem: data.problem,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId().toHexString(),
        userId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!doc) {
    throw new Error("company_save_failed");
  }
  return doc;
}

/** Persists the Revenue Intelligence assessment on the company record. */
export async function saveCompanyAssessment(
  userId: string,
  assessment: CompanyAssessment,
): Promise<void> {
  const db = await getDb();
  await db.collection<CompanyDoc>("companies").updateOne(
    { userId },
    { $set: { assessment, updatedAt: new Date().toISOString() } },
  );
}

/**
 * Advances the onboarding funnel.
 *
 * The move is validated server-side against `ONBOARDING_TRANSITIONS` and
 * applied conditionally on the stage we believed the company was in, so a
 * duplicated or out-of-order request cannot skip a step — `company_saved` cannot
 * become `plan_ready` in one request. The conditional update is what makes this
 * safe against a double submit; `canTransition` alone would not be, because it
 * re-reads a stale stage.
 *
 * Returns false when the company was not in `from`, or the move is illegal —
 * callers treat that as "someone else already advanced this" rather than an
 * error, so the common case stays idempotent.
 */
export async function advanceOnboardingStage(
  userId: string,
  from: OnboardingStage,
  to: OnboardingStage,
): Promise<boolean> {
  if (!canTransition(from, to)) return false;

  const db = await getDb();
  const result = await db
    .collection<CompanyDoc>("companies")
    .updateOne(
      { userId, onboardingStage: from },
      { $set: { onboardingStage: to, updatedAt: new Date().toISOString() } },
    );

  return result.modifiedCount === 1;
}

/**
 * Moves a company into `company_saved` on first registration, without
 * clobbering a stage it has already progressed past on a later edit.
 */
export async function initOnboardingStage(userId: string): Promise<void> {
  const db = await getDb();
  await db.collection<CompanyDoc>("companies").updateOne(
    { userId, onboardingStage: { $exists: false } },
    { $set: { onboardingStage: "company_saved" } },
  );
}