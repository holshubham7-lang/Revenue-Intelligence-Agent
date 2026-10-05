import { findCompanyByUserId, type CompanyDoc } from "./companies";
import type { OnboardingStage } from "./data/types";

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
 * Server-only: it reads Mongo through `./companies`.
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
 * Every stage from `company_saved` onwards resolves to `/chat`. Upload used to be
 * its own route, so `company_saved`/`awaiting_data`/`analyzing` sent the user to
 * `/data` to find a file before they could ask a question; the files are now a
 * panel inside the chat and `app/data/page.tsx` redirects here, so pointing these
 * at `/data` would be a hop that goes nowhere.
 *
 * `company_saved` is the stage the company form leaves behind, and it now hands
 * off to the chat for the same reason.
 */
const STAGE_ENTRY: Readonly<Record<OnboardingStage, WorkspaceEntry>> = {
  company_saved: "/chat",
  awaiting_data: "/chat",
  analyzing: "/chat",
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