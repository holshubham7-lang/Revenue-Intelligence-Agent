import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { initOnboardingStage, saveCompanyRegistration, validateCompany } from "@/lib/companies";

/**
 * Company registration — saves the signed-in user's company profile.
 *
 * Same defences as the auth API: double-submit CSRF, a valid `revops_session`
 * cookie (the record is keyed to the signed-in user), and server-side field
 * validation against the same option lists the form offers. One company record
 * per user; a repeat submission updates the existing record.
 *
 * Request:  { companyName, website, industry, companySize, country,
 *             revenueRange, problem }
 * Success:  201 { company: { id, name } }
 * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf ·
 *           422 validation · 500
 */
export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      { error: { code: "csrf_failed", message: "Session token missing or invalid. Refresh the page and try again." } },
      { status: 403 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Sign in again to continue." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Invalid request body." } },
      { status: 400 },
    );
  }

  const result = validateCompany(body);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Please fix the highlighted fields.",
          fields: result.fields,
        },
      },
      { status: 422 },
    );
  }

  try {
    const doc = await saveCompanyRegistration(user._id, result.data);
    // A first-time registration enters the funnel at `company_saved`. Idempotent:
    // a later edit does not rewind a company that has already progressed.
    await initOnboardingStage(user._id);
    return NextResponse.json(
      { company: { id: doc._id, name: doc.companyName } },
      { status: 201 },
    );
  } catch (err) {
    console.error("companies: failed to save", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Couldn't save your company right now. Please try again in a moment." } },
      { status: 500 },
    );
  }
}