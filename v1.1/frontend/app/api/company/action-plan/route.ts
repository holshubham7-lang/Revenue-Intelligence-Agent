import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { advanceOnboardingStage, findCompanyByUserId } from "@/lib/companies";
import { generateActionPlan } from "@/lib/agent/plan";
import {
  buildDatasetContext,
  generateDataQuestions,
  QuestionGenerationError,
} from "@/lib/agent/analyze";
import {
  latestActionPlan,
  latestProfile,
  readyProfiles,
  saveActionPlan,
} from "@/lib/data/pipeline";

export const runtime = "nodejs";

/**
 * Reads or generates the company's action plan.
 *
 * `GET` returns the newest plan, or the questions to ask if there isn't one yet.
 * `POST` generates it from whatever exists — a data profile if a file was
 * uploaded, plus the user's answers — then indexes it in the knowledge base and
 * advances onboarding to `plan_ready`.
 *
 * Both paths accept the questions/answers so a user who skipped the upload still
 * gets a plan from the original profile interview. The plan is versioned, so
 * regenerating after fixing their data keeps the earlier plan and both are
 * retrievable.
 */

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function asStringList(value: unknown, limit = 12, maxLength = 4000): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) {
    return errorResponse(401, "unauthenticated", "Your session has expired.");
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return errorResponse(404, "no_company", "Finish your company profile first.");
  }

  const existing = await latestActionPlan(company._id);
  if (existing) {
    return NextResponse.json({ plan: toClientPlan(existing) }, { status: 200 });
  }

  // No plan yet. Questions are grounded on every report the user uploaded, each
  // with the analysis the analysis agent already wrote at upload time. Passing
  // only the newest profile — or the metrics without the stored analysis — is
  // what made these questions read as though the data had never been opened, so
  // the whole set is assembled here.
  const context = buildDatasetContext(await readyProfiles(company._id));

  try {
    const questions = await generateDataQuestions(company, context, 5);
    return NextResponse.json(
      { plan: null, questions, dataset: toClientDataset(context) },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof QuestionGenerationError) {
      // Surfaced, not masked. A canned set here would look identical to a working
      // agent while ignoring everything the user uploaded.
      return NextResponse.json(
        { plan: null, questions: [], dataset: toClientDataset(context), questionsError: err.message },
        { status: 503 },
      );
    }
    throw err;
  }
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

  let body: { questions?: unknown; answers?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid_request", "Invalid request body.");
  }

  const questions = asStringList(body.questions);
  const answers = asStringList(body.answers);

  if (questions.length === 0) {
    return errorResponse(400, "invalid_request", "There are no questions to build a plan from.");
  }

  // Grounded on every report, matching what the questions were built from. A
  // plan derived from one file while the questions came from three would answer
  // questions the plan was never given the context to answer.
  const context = buildDatasetContext(await readyProfiles(company._id));
  const nowIso = new Date().toISOString();

  try {
    const draft = await generateActionPlan({
      company,
      profile: await latestProfile(company._id),
      dataset: context.files.length > 0 ? context : null,
      questions,
      answers,
      nowIso,
    });

    const saved = await saveActionPlan({
      companyId: company._id,
      companyName: company.companyName,
      plan: draft,
    });

    // Chat unlocks only once a plan exists.
    //
    // Every edge the company could plausibly be sitting on is attempted. The
    // `→ questions` edges matter: a user who skipped the upload, or reached this
    // page directly, is still in `company_saved`/`awaiting_data`, and
    // transitioning only `questions → plan_ready` would leave them short of
    // `plan_ready` and locked out of chat permanently. Each call is a
    // conditional update that no-ops when the company is in another stage, which
    // keeps the whole sequence idempotent for a double submit.
    await advanceOnboardingStage(user._id, "company_saved", "questions");
    await advanceOnboardingStage(user._id, "awaiting_data", "questions");
    await advanceOnboardingStage(user._id, "analyzing", "questions");
    await advanceOnboardingStage(user._id, "questions", "plan_ready");

    return NextResponse.json({ plan: toClientPlan(saved) }, { status: 201 });
  } catch (err) {
    console.error("action-plan: generation failed", err instanceof Error ? err.message : err);
    return errorResponse(500, "generation_failed", "Couldn't build your action plan. Please try again.");
  }
}

/**
 * What the client needs to explain the questions it is about to ask.
 *
 * File names and caveats only — never metrics, never the stored summary. The
 * numbers are already deterministic and the user saw them on the data screen;
 * resending them adds nothing and widens what sits in a client payload.
 */
function toClientDataset(context: ReturnType<typeof buildDatasetContext>) {
  return {
    fileCount: context.files.length,
    fileNames: context.files.map((file) => file.fileName),
    valid: context.valid,
    blockers: [...context.blockers],
    caveats: [...context.caveats],
  };
}

/** Strips the answers before the plan crosses to the client. */
function toClientPlan(plan: {
  _id: string;
  version: number;
  status: string;
  diagnosis: string;
  actions: unknown[];
  projectedImpact: { summary: string };
  profileSummary?: string;
  kb?: { documentId: string; indexedAt: string };
  createdAt: string;
}) {
  return {
    id: plan._id,
    version: plan.version,
    status: plan.status,
    diagnosis: plan.diagnosis,
    actions: plan.actions,
    projectedImpact: plan.projectedImpact,
    profileSummary: plan.profileSummary ?? null,
    indexed: Boolean(plan.kb),
    createdAt: plan.createdAt,
  };
}
