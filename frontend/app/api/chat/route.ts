import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { streamChat, type ChatTurn } from "@/lib/agent/foundry";
import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import {
  MAX_SEED_MESSAGES,
  appendChatMessages,
  chatMessage,
  readChatThread,
  startChatThread,
  threadTitleFrom,
} from "@/lib/data/chat";
import type { ChatMessageDoc } from "@/lib/data/types";

const MAX_MESSAGE_LENGTH = 8000;
const MAX_HISTORY = 8;
/** Thread ids are 24-hex; anything longer than this is not an id we issued. */
const MAX_THREAD_ID_LENGTH = 64;

/**
 * Revenue assistant chat — streams the assistant's reply as Server-Sent Events
 * and saves the conversation so a refresh does not erase it.
 *
 * Request:  { content: string, history?: { role, content }[], threadId?: string }
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
export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      { error: { code: "csrf_failed", message: "Session token missing or invalid. Refresh the page and try again." } },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const user = await resolveSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Sign in again to continue." } },
      { status: 401 },
    );
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return NextResponse.json(
      { error: { code: "no_company", message: "Register your company before chatting with the agent." } },
      { status: 404 },
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

  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const rawHistory = Array.isArray(raw.history) ? raw.history : [];
  const rawThreadId = typeof raw.threadId === "string" ? raw.threadId.trim() : "";

  if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Send a message between 1 and 8000 characters." } },
      { status: 400 },
    );
  }

  const threadId =
    rawThreadId.length > 0 && rawThreadId.length <= MAX_THREAD_ID_LENGTH ? rawThreadId : null;
  /* Captured before the callbacks below, where TypeScript no longer carries the
     null check on `company` across a hoisted function. */
  const companyId = company._id;

  const stored = threadId ? await readChatThread(companyId, threadId) : null;
  if (threadId && !stored) {
    return NextResponse.json(
      { error: { code: "thread_not_found", message: "That conversation no longer exists." } },
      { status: 404 },
    );
  }

  const clientHistory: ChatMessageDoc[] = rawHistory
    .slice(-MAX_SEED_MESSAGES)
    .flatMap((turn): ChatMessageDoc[] => {
      if (typeof turn !== "object" || turn === null) return [];
      const item = turn as Record<string, unknown>;
      if (item.role !== "user" && item.role !== "assistant") return [];
      if (typeof item.content !== "string" || item.content.trim().length === 0) return [];
      return [chatMessage(item.role, item.content)];
    });

  // A saved thread is the source of truth; the client only supplies context for
  // a conversation that has never been persisted.
  const history: ChatTurn[] = (stored ? stored.messages.slice(-MAX_HISTORY) : clientHistory.slice(-MAX_HISTORY)).map(
    (message) => ({ role: message.role, content: message.content }),
  );

  let activeThreadId = "";
  const userTurn = chatMessage("user", content);
  try {
    if (stored) {
      await appendChatMessages(companyId, stored._id, [userTurn]);
      activeThreadId = stored._id;
    } else {
      const thread = await startChatThread({
        companyId,
        title: threadTitleFrom(content),
        messages: [...clientHistory, userTurn],
      });
      activeThreadId = thread._id;
    }
  } catch (err) {
    console.error("chat: could not save the question", err instanceof Error ? err.message : err);
  }

  const encoder = new TextEncoder();
  let answer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: string) => {
        controller.enqueue(encoder.encode(payload));
      };
      try {
        for await (const token of streamChat(company, content, history)) {
          answer += token;
          send(`data: ${JSON.stringify({ token })}\n\n`);
        }
      } catch (err) {
        console.error("chat: stream failed", err instanceof Error ? err.message : err);
        send(`event: error\ndata: ${JSON.stringify({ message: "The intelligence engine lost the connection." })}\n\n`);
      } finally {
        // Saved before the terminator: a client that sees [DONE] may refetch the
        // conversation list at once, and the reply it just read had better be in it.
        await saveAnswer();
        send("data: [DONE]\n\n");
        controller.close();
      }
    },
  });

  /** Whatever the model managed to say is worth keeping, even on a broken stream. */
  async function saveAnswer(): Promise<void> {
    if (!activeThreadId || answer.trim().length === 0) return;
    try {
      await appendChatMessages(companyId, activeThreadId, [chatMessage("assistant", answer)]);
    } catch (err) {
      console.error("chat: could not save the reply", err instanceof Error ? err.message : err);
    }
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables proxy buffering so tokens reach the browser as they arrive.
      "X-Accel-Buffering": "no",
      ...(activeThreadId ? { "x-thread-id": activeThreadId } : {}),
    },
  });
}
