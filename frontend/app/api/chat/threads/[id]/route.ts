import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import { readChatThread } from "@/lib/data/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One conversation, transcript included.
 *
 * The id comes from the path but the company comes from the session, and both go
 * into the same filter — a thread belonging to another company reads as missing
 * rather than as found-and-forbidden, which would confirm the id exists.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const thread = await readChatThread(company._id, id);
  if (!thread) {
    return NextResponse.json({ error: { code: "not_found", message: "That conversation wasn't found." } }, { status: 404 });
  }

  return NextResponse.json(
    {
      thread: {
        id: thread._id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        messages: thread.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
    },
    { status: 200 },
  );
}
