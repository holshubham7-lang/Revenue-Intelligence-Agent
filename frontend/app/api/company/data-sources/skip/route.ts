import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { advanceOnboardingStage, findCompanyByUserId } from "@/lib/companies";

export const runtime = "nodejs";

/**
 * Skips the upload step.
 *
 * Skipping is a first-class outcome, not a failure, and it is recorded rather
 * than left to a client-side navigation: `ONBOARDING_TRANSITIONS` allows
 * `awaiting_data → questions` precisely so a company with no data has a real,
 * auditable path through onboarding instead of one that only exists in the UI.
 * Without this the company stays in `company_saved` and the stage record claims
 * work that never happened.
 *
 * The user then lands in the chat interview, which generates its own questions
 * from the company profile — so this records the stage and returns, and never
 * makes the skip depend on the model being reachable.
 *
 * Errors: 401 unauthenticated · 403 csrf · 404 · 500
 */

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return errorResponse(403, "csrf_failed", "Session token missing or invalid.");
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) {
    return errorResponse(401, "unauthenticated", "Your session has expired.");
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return errorResponse(404, "no_company", "Finish your company profile first.");
  }

  try {
    // Reach `awaiting_data` first if the company never got there, then take the
    // skip edge. Both calls are conditional no-ops when already in the stage, so
    // skipping twice is safe.
    await advanceOnboardingStage(user._id, "company_saved", "awaiting_data");
    await advanceOnboardingStage(user._id, "awaiting_data", "questions");

    return NextResponse.json({ skipped: true }, { status: 200 });
  } catch (err) {
    console.error("data-sources/skip: failed", err instanceof Error ? err.message : err);
    return errorResponse(500, "internal_error", "Couldn't skip that step. Please try again.");
  }
}
