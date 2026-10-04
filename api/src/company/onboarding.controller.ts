import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { ApiError, notFound, unprocessable } from "../common/api-error";
import { assertCsrf, readJson } from "../common/http";
import { CurrentUser } from "../auth/session.interceptor";
import type { UserDoc } from "../auth/user";
import {
  advanceOnboardingStage,
  findCompanyByUserId,
  saveCompanyAssessment,
  type CompanyDoc,
} from "../companies";
import { generateAssessment, streamChat, type ChatTurn } from "../agent/foundry";
import {
  buildDatasetContext,
  generateDataQuestions,
  generateOnboardingQuestions,
  QuestionGenerationError,
} from "../agent/analyze";
import { generateActionPlan } from "../agent/plan";
import {
  latestActionPlan,
  latestProfile,
  readyProfiles,
  saveActionPlan,
} from "../data/pipeline";
import {
  MAX_SEED_MESSAGES,
  appendChatMessages,
  chatMessage,
  deleteChatThread,
  listChatThreads,
  readChatThread,
  startChatThread,
  threadTitleFrom,
} from "../data/chat";
import type { ChatMessageDoc } from "../data/types";

const MAX_QUESTIONS = 15;
const MAX_ANSWER_LENGTH = 8000;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY = 8;
/** Thread ids are 24-hex; anything longer than this is not an id we issued. */
const MAX_THREAD_ID_LENGTH = 64;

/**
 * The onboarding assessment interview, and the action plan it produces.
 *
 * `GET /api/company/action-plan` returns the newest plan, or the questions to ask
 * if there isn't one yet. `POST` generates it from whatever exists — a data
 * profile if a file was uploaded, plus the user's answers — then indexes it in
 * the knowledge base and advances onboarding to `plan_ready`.
 *
 * Both paths accept the questions/answers so a user who skipped the upload still
 * gets a plan from the original profile interview. The plan is versioned, so
 * regenerating after fixing their data keeps the earlier plan and both stay
 * retrievable.
 */
@Controller("company/action-plan")
export class ActionPlanController {
  @Get()
  async read(
    @CurrentUser("Your session has expired.") _user: UserDoc,
    @Res({ passthrough: true }) response: Response,
  ) {
    const company = await this.requireCompany(_user._id, "Finish your company profile first.");

    const existing = await latestActionPlan(company._id);
    if (existing) return { plan: toClientPlan(existing) };

    /* No plan yet. Questions are grounded on every report the user uploaded,
       each with the analysis the analysis agent already written at upload time.
       Passing only the newest profile — or the metrics without the stored
       analysis — is what made these questions read as though the data had never
       been opened, so the whole set is assembled here. */
    const context = buildDatasetContext(await readyProfiles(company._id));

    try {
      const questions = await generateDataQuestions(company, context, 5);
      return { plan: null, questions, dataset: toClientDataset(context) };
    } catch (error: unknown) {
      /* Surfaced, not masked, and *not* an error envelope: the client reads
         `plan` and `dataset` off this body to keep rendering the data screen, so
         it needs the usual shape with an empty question list. A canned set here
         would look identical to a working agent while ignoring everything the
         user uploaded. */
      if (error instanceof QuestionGenerationError) {
        response.status(HttpStatus.SERVICE_UNAVAILABLE);
        return {
          plan: null,
          questions: [],
          dataset: toClientDataset(context),
          questionsError: error.message,
        };
      }
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async generate(@Req() request: Request, @CurrentUser("Your session has expired.") user: UserDoc) {
    assertCsrf(request, "Session token missing or invalid.");
    const company = await this.requireCompany(user._id, "Finish your company profile first.");

    const body = await readJson<{ questions?: unknown; answers?: unknown }>(request);
    const questions = asStringList(body.questions);
    const answers = asStringList(body.answers);

    if (questions.length === 0) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "invalid_request",
        "There are no questions to build a plan from.",
      );
    }

    /* Grounded on every report, matching what the questions were built from. A
       plan derived from one file while the questions came from three would
       answer questions the plan was never given the context to answer. */
    const context = buildDatasetContext(await readyProfiles(company._id));

    try {
      const draft = await generateActionPlan({
        company,
        profile: await latestProfile(company._id),
        dataset: context.files.length > 0 ? context : null,
        questions,
        answers,
        nowIso: new Date().toISOString(),
      });

      const saved = await saveActionPlan({
        companyId: company._id,
        companyName: company.companyName,
        plan: draft,
      });

      /* Chat unlocks only once a plan exists.
         Every edge the company could plausibly be sitting on is attempted. The
         `* -> questions` edges matter: a user who skipped the upload, or reached
         this page directly, is still in `company_saved`/`awaiting_data`, and
         transitioning only `questions -> plan_ready` would leave them short of
         `plan_ready` and locked out of chat permanently. Each call is a
         conditional update that no-ops in any other stage, which keeps the whole
         sequence idempotent for a double submit. */
      await advanceToPlanReady(user._id);

      return { plan: toClientPlan(saved) };
    } catch (error: unknown) {
      console.error("action-plan: generation failed", error instanceof Error ? error.message : error);
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "generation_failed",
        "Couldn't build your action plan. Please try again.",
      );
    }
  }

  private async requireCompany(userId: string, message: string): Promise<CompanyDoc> {
    const company = await findCompanyByUserId(userId);
    if (!company) throw notFound("no_company", message);
    return company;
  }
}

/** Walks a company forward to `plan_ready` from wherever it currently sits. */
async function advanceToPlanReady(userId: string): Promise<void> {
  await advanceOnboardingStage(userId, "company_saved", "questions");
  await advanceOnboardingStage(userId, "awaiting_data", "questions");
  await advanceOnboardingStage(userId, "analyzing", "questions");
  await advanceOnboardingStage(userId, "questions", "plan_ready");
}

@Controller("agent/onboarding")
export class AgentOnboardingController {
  /**
   * Generates the tailored interview questions for the signed-in user's
   * registered company.
   *
   * Grounded on every report the user has already uploaded: the dataset context
   * is assembled server-side and handed to the Foundry agent, which writes the
   * questions from it (the model deployment stands in when the agent endpoint
   * is down). With no uploads this is the original profile-only interview.
   * Nothing about the dataset is trusted from the client.
   *
   * Success:  200 { questions: string[] }
   * Errors:   401 unauthenticated · 403 csrf · 404 no_company · 503 engine_*
   */
  @Post("questions")
  @HttpCode(HttpStatus.OK)
  async questions(@Req() request: Request, @CurrentUser() user: UserDoc) {
    assertCsrf(request);

    const company = await findCompanyByUserId(user._id);
    if (!company) {
      throw notFound("no_company", "Register your company before starting the assessment.");
    }

    const context = buildDatasetContext(await readyProfiles(company._id));

    try {
      const questions = await generateOnboardingQuestions(company, context, 5);
      if (questions.length === 0) {
        throw new ApiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "engine_empty",
          "The intelligence engine did not return any questions. Please try again.",
        );
      }
      return { questions };
    } catch (error: unknown) {
      /* An `ApiError` raised above is a deliberate outcome carrying its own code
         and message; only an unexpected fault becomes `engine_unavailable`. */
      if (error instanceof ApiError) throw error;
      console.error(
        "agent: failed to generate questions",
        error instanceof Error ? error.message : error,
      );
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "engine_unavailable",
        "Couldn't prepare your onboarding questions right now. Please try again in a moment.",
      );
    }
  }

  /**
   * Builds the Revenue Intelligence assessment from the collected interview Q&A,
   * persists it on the company record, and returns the markdown for display.
   * Degrades to a deterministic fallback assessment when the engine is briefly
   * unavailable, so onboarding always completes.
   *
   * Request:  { questions: string[], answers: string[] }
   * Success:  200 { result: string }
   * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf · 404 no_company ·
   *           422 validation · 503 engine_*
   */
  @Post("assess")
  @HttpCode(HttpStatus.OK)
  async assess(@Req() request: Request, @CurrentUser() user: UserDoc) {
    assertCsrf(request);

    const raw = await readJson<Record<string, unknown>>(request);
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
      throw unprocessable("validation_failed", "Please fix the highlighted fields.", fields);
    }

    const company = await findCompanyByUserId(user._id);
    if (!company) {
      throw notFound("no_company", "Register your company before building the assessment.");
    }

    try {
      const trimmedQuestions = (questions as string[]).map((q) => q.trim());
      const trimmedAnswers = (answers as string[]).map((a) => a.trim());

      const result = await generateAssessment(company, trimmedQuestions, trimmedAnswers);
      if (!result.trim()) {
        throw new ApiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "engine_empty",
          "The intelligence engine returned an empty assessment. Please try again.",
        );
      }

      await saveCompanyAssessment(user._id, {
        questions: trimmedQuestions,
        answers: trimmedAnswers,
        result,
        createdAt: new Date().toISOString(),
      });
      return { result };
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      console.error(
        "agent: failed to build assessment",
        error instanceof Error ? error.message : error,
      );
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "engine_unavailable",
        "Couldn't build your assessment right now. Please try again in a moment.",
      );
    }
  }
}

/**
 * Revenue assistant chat — streams the assistant's reply as Server-Sent Events
 * and saves the conversation so a refresh does not erase it.
 *
 * Success:  200 text/event-stream with an `x-thread-id` header,
 *           `data: {"token":"..."}` frames, then `data: [DONE]`
 * Errors:   400 invalid_request · 401 unauthenticated · 403 csrf
 *           · 404 no_company / thread_not_found
 *
 * The company is resolved from the session, never trusted from the client, so
 * replies are grounded in the right profile and assessment — and so a thread id
 * from another company resolves to nothing here rather than to their transcript.
 *
 * For a thread that exists, its stored turns are the conversation context; the
 * `history` the client sends is used only to open a new thread, where it carries
 * the onboarding Q&A already on screen. Saving is best-effort: if it fails the
 * reply still streams and the client simply keeps its in-memory transcript.
 */
@Controller("chat")
export class ChatController {
  @Post()
  async chat(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentUser() user: UserDoc,
  ): Promise<void> {
    assertCsrf(request);

    const company = await findCompanyByUserId(user._id);
    if (!company) {
      throw notFound("no_company", "Register your company before chatting with the agent.");
    }

    const raw = await readJson<Record<string, unknown>>(request);
    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "validation_failed",
        "Send a message between 1 and 8000 characters.",
      );
    }

    const rawThreadId = typeof raw.threadId === "string" ? raw.threadId.trim() : "";
    const threadId =
      rawThreadId.length > 0 && rawThreadId.length <= MAX_THREAD_ID_LENGTH ? rawThreadId : null;

    const stored = threadId ? await readChatThread(company._id, threadId) : null;
    if (threadId && !stored) {
      throw notFound("thread_not_found", "That conversation no longer exists.");
    }

    const clientHistory = asChatMessages(raw.history, MAX_SEED_MESSAGES);
    const history: ChatTurn[] = (stored ? stored.messages.slice(-MAX_HISTORY) : clientHistory).map(
      (message) => ({ role: message.role, content: message.content }),
    );

    let activeThreadId = "";
    const userTurn = chatMessage("user", content);
    try {
      if (stored) {
        await appendChatMessages(company._id, stored._id, [userTurn]);
        activeThreadId = stored._id;
      } else {
        const thread = await startChatThread({
          companyId: company._id,
          title: threadTitleFrom(content),
          messages: [...clientHistory, userTurn],
        });
        activeThreadId = thread._id;
      }
    } catch (error: unknown) {
      console.error("chat: could not save the question", error instanceof Error ? error.message : error);
    }

    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    /* Disables proxy buffering so tokens reach the browser as they arrive rather
       than in one lump when the upstream connection closes. */
    response.setHeader("X-Accel-Buffering", "no");
    /* How the client learns the id of the conversation it just started, so a
       refresh — or the next message — keeps writing to the same thread. */
    if (activeThreadId) response.setHeader("x-thread-id", activeThreadId);
    /* Every validation failure above throws before this point, so the stream
       headers are only ever set on a request that will actually produce tokens. */
    response.flushHeaders?.();

    const send = (payload: string): void => {
      response.write(payload);
    };

    let answer = "";

    try {
      for await (const token of streamChat(company, content, history)) {
        answer += token;
        send(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch (error: unknown) {
      console.error("chat: stream failed", error instanceof Error ? error.message : error);
      send(
        `event: error\ndata: ${JSON.stringify({
          message: "The intelligence engine lost the connection.",
        })}\n\n`,
      );
    } finally {
      /* Whatever the model managed to say is worth keeping, even on a broken
         stream, and it is saved before the terminator: a client that sees
         `[DONE]` may refetch the conversation list at once. */
      if (activeThreadId && answer.trim().length > 0) {
        try {
          await appendChatMessages(company._id, activeThreadId, [chatMessage("assistant", answer)]);
        } catch (error: unknown) {
          console.error("chat: could not save the reply", error instanceof Error ? error.message : error);
        }
      }
      /* Always terminated, so a client reading to `data: [DONE]` never hangs
         waiting for a close that an error path skipped. */
      send("data: [DONE]\n\n");
      response.end();
    }
  }
}

/**
 * The recent-chats list: `GET /api/chat/threads` and one conversation at
 * `GET /api/chat/threads/:id`, with `DELETE /api/chat/threads?id=` to forget one.
 *
 * Mirrors `app/api/chat/threads/**` on the frontend. Titles and timestamps come
 * back on the list so opening it cannot pull every message the company has ever
 * exchanged, and each read filters on the session's company as well as the id.
 */
@Controller("chat/threads")
export class ChatThreadsController {
  @Get()
  async list(@CurrentUser() user: UserDoc) {
    const company = await findCompanyByUserId(user._id);
    if (!company) return { threads: [] };
    return { threads: await listChatThreads(company._id) };
  }

  @Get(":id")
  async read(@CurrentUser() user: UserDoc, @Param("id") id: string) {
    const company = await findCompanyByUserId(user._id);
    if (!company) throw notFound("not_found", "No company found.");

    /* A thread belonging to another company reads as missing rather than as
       found-and-forbidden, which would confirm the id exists. */
    const thread = await readChatThread(company._id, id);
    if (!thread) throw notFound("not_found", "That conversation wasn't found.");

    return {
      thread: {
        id: thread._id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        messages: thread.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
    };
  }

  @Delete()
  async remove(
    @Req() request: Request,
    @CurrentUser() user: UserDoc,
    @Query("id") id: string | undefined,
  ) {
    assertCsrf(request);

    const company = await findCompanyByUserId(user._id);
    if (!company) throw notFound("not_found", "No company found.");
    if (!id) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "invalid_request", "A conversation id is required.");
    }

    const deleted = await deleteChatThread(company._id, id);
    if (!deleted) throw notFound("not_found", "That conversation wasn't found.");

    return { deleted: true };
  }
}

function asStringList(value: unknown, limit = 12, maxLength = 4000): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, limit);
}

/**
 * Turns the client sends for context.
 *
 * Only used to open a thread; once a thread exists its own stored turns are the
 * context, so what a client claims about the past cannot shape the prompt.
 */
function asChatMessages(value: unknown, limit: number): ChatMessageDoc[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-limit).flatMap((turn): ChatMessageDoc[] => {
    if (typeof turn !== "object" || turn === null) return [];
    const item = turn as Record<string, unknown>;
    if (item.role !== "user" && item.role !== "assistant") return [];
    if (typeof item.content !== "string" || item.content.trim().length === 0) return [];
    return [chatMessage(item.role, item.content)];
  });
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
