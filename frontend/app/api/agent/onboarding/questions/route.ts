import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { generateQuestions } from "@/lib/agent/foundry";
import { findCompanyByUserId } from "@/lib/companies";

/**
 * Agent onboarding — generates the tailored interview questions for the
 * signed-in user's registered company by asking the Azure AI Foundry model for
 * a JSON list and parsing it.
 *
 * Same defences as the rest of the API: double-submit CSRF and a valid session;
 * the company profile is resolved server-side, never trusted from the client.
 *
 * Success:  200 { questions: string[] }
 * Errors:   401 unauthenticated · 403 csrf · 404 no_company ·
 *           503 engine_unavailable
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

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return NextResponse.json(
      { error: { code: "no_company", message: "Register your company before starting the assessment." } },
      { status: 404 },
    );
  }

  try {
    const questions = await generateQuestions(company);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: { code: "engine_empty", message: "The intelligence engine did not return any questions. Please try again." } },
        { status: 503 },
      );
    }
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("agent: failed to generate questions", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: "engine_unavailable", message: "Couldn't prepare your onboarding questions right now. Please try again in a moment." } },
      { status: 503 },
    );
  }
}