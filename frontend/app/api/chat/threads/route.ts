import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { deleteChatThread, listChatThreads } from "@/lib/data/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The recent-chats list. `GET` is safe so it needs no CSRF token; `DELETE` is
 * state-changing and does.
 *
 * Titles and timestamps only — the transcript itself is fetched per conversation
 * by `/api/chat/threads/[id]`, so opening the sidebar cannot pull every saved
 * message the company has ever exchanged.
 */
export async function GET() {
  const cookieStore = await cookies();
  const user = await resolveSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired." } },
      { status: 401 },
    );
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) return NextResponse.json({ threads: [] }, { status: 200 });

  const threads = await listChatThreads(company._id);
  return NextResponse.json({ threads }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      { error: { code: "csrf_failed", message: "Session token missing or invalid." } },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const user = await resolveSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired." } },
      { status: 401 },
    );
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return NextResponse.json({ error: { code: "not_found", message: "No company found." } }, { status: 404 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: { code: "invalid_request", message: "A conversation id is required." } }, { status: 400 });
  }

  const deleted = await deleteChatThread(company._id, id);
  if (!deleted) {
    return NextResponse.json({ error: { code: "not_found", message: "That conversation wasn't found." } }, { status: 404 });
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
