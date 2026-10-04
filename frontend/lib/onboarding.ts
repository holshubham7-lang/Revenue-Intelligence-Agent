import { findCompanyByUserId, type CompanyDoc } from "@/lib/companies";
import type { OnboardingStage } from "@/lib/data/types";

/**
 * Where a returning user belongs.
 *
 * Sign-in used to send everyone to `/company`, on the assumption that the only
 * way back into the product was through the registration form. That is only true
 * for someone's *first* visit: a user who saved their company, shared data, and
 * signed out came back to a form they had already filled in, which reads as
 * "my details were lost" rather than "you are already signed up".
 *
 * The funnel was already recorded — `companies.onboardingStage` moves through
 * `company_saved → awaiting_data → analyzing → questions → plan_ready` — so the
 * destination is a lookup, not a new piece of state to keep in sync.
 *
 * Server-only: it reads Mongo through `@/lib/companies`.
 */

/**
 * The closed set of destinations. A union rather than `string` so a typo or an
 * unchecked value cannot become a redirect target, and so every caller that
 * takes one has to handle exactly these three.
 */
export type WorkspaceEntry = "/company" | "/data" | "/chat";

/**
 * Stage → the screen that moves the user forward.
 *
 * `company_saved` and `awaiting_data`/`analyzing` both resolve to `/data`: the
 * company form hands off there on save, so it is where the user was already
 * sent, and it is where a mid-upload refresh belongs. `questions` and
 * `plan_ready` resolve to `/chat`, because the questions now run as an interview
 * inside the chat rather than on their own route (see `app/company/action-plan`).
 */
const STAGE_ENTRY: Readonly<Record<OnboardingStage, WorkspaceEntry>> = {
  company_saved: "/data",
  awaiting_data: "/data",
  analyzing: "/data",
  questions: "/chat",
  plan_ready: "/chat",
};

/** What we assume for a record written before the stage field existed. */
const DEFAULT_STAGE: OnboardingStage = "company_saved";

/**
 * Is this user's company profile finished?
 *
 * A record existing *is* the signal, and deliberately not a check on individual
 * fields: `saveCompanyRegistration` is only ever reached through
 * `validateCompany`, which rejects the request unless company name, industry,
 * company size, and revenue range are all present. So "a company document
 * exists" and "the profile is complete" cannot disagree — re-deriving it from the
 * fields would add a second definition that can drift from the validator.
 *
 * A `null` record means the user has never completed registration, which is the
 * one case that genuinely must go back to the form.
 */
export function isCompanyProfileComplete(doc: CompanyDoc | null): doc is CompanyDoc {
  return doc !== null;
}

/**
 * The destination for a known company record, purely a function of its stage —
 * exported separately so it can be unit-tested without a database.
 *
 * A record with no `onboardingStage` is treated as `company_saved`. `initOnboardingStage`
 * back-fills the field on save, so its absence means a record written before the
 * funnel was tracked, and those users were necessarily at "form submitted,
 * nothing else done".
 */
export function workspaceEntryFor(doc: CompanyDoc | null): WorkspaceEntry {
  if (!isCompanyProfileComplete(doc)) return "/company";
  return STAGE_ENTRY[doc.onboardingStage ?? DEFAULT_STAGE] ?? "/company";
}

/**
 * Resolves the post-sign-in destination for a user, reading their company
 * record if one exists.
 */
export async function resolveWorkspaceEntry(userId: string): Promise<WorkspaceEntry> {
  return workspaceEntryFor(await findCompanyByUserId(userId));
}