import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { generateAssessment } from "@/lib/agent/foundry";
import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId, saveCompanyAssessment } from "@/lib/companies";

const MAX_QUESTIONS = 15;
const MAX_ANSWER_LENGTH = 8000;

/**
 * Agent onboarding — builds the Revenue Intelligence assessment from the
 * collected interview Q&A, persists it on the company record, and returns the
 * markdown result for display. Degrades to a deterministic fallback assessment
 * when the engine is briefly unavailable, so onboarding always completes.
 *
 * Request:  { questions: string[], answers: string[] }
 * Success:  200 { result: string }
 * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf ·
 *           404 no_company · 422 validation
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

  const raw =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  const answers = Array.isArray(raw.answers) ? raw.answers : [];

  const fields: Record<string, string> = {};
  if (
    questions.length === 0 ||
    questions.length > MAX_QUESTIONS ||
    !questions.every((q) => typeof q === "string" && q.trim().length > 0)
  ) {
    fields.questions = "Provide between 1 and 15 non-empty questions.";
  }
  if (
    answers.length === 0 ||
    answers.length !== questions.length ||
    !answers.every((a) => typeof a === "string" && a.trim().length <= MAX_ANSWER_LENGTH)
  ) {
    fields.answers = "Every question needs a matching answer (max 8000 chars).";
  }

  if (Object.keys(fields).length > 0) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Please fix the highlighted fields.", fields } },
      { status: 422 },
    );
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return NextResponse.json(
      { error: { code: "no_company", message: "Register your company before building the assessment." } },
      { status: 404 },
    );
  }

  try {
    const trimmedQuestions = (questions as string[]).map((q) => q.trim());
    const trimmedAnswers = (answers as string[]).map((a) => a.trim());

    const result = await generateAssessment(
      company,
      trimmedQuestions,
      trimmedAnswers,
    );

    if (!result.trim()) {
      return NextResponse.json(
        { error: { code: "engine_empty", message: "The intelligence engine returned an empty assessment. Please try again." } },
        { status: 503 },
      );
    }

    await saveCompanyAssessment(user._id, {
      questions: trimmedQuestions,
      answers: trimmedAnswers,
      result,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("agent: failed to build assessment", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: "engine_unavailable", message: "Couldn't build your assessment right now. Please try again in a moment." } },
      { status: 503 },
    );
  }
}