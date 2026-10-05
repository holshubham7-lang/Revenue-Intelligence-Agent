import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { validateProfileUpdate } from "@/lib/auth/validation";
import { resolveSessionUser, type UserDoc } from "@/lib/auth/user";
import { getDb } from "@/lib/db";

/**
 * Renames the signed-in user.
 *
 * `POST` rather than `PATCH` because every state-changing request in this app
 * goes through the double-submit CSRF helper (`postJson` in
 * `lib/api/csrf-client.ts`), which only speaks POST. Making this a PATCH would
 * mean a second CSRF-aware client for one route.
 *
 * Only the name is writable. The email is the account's identity — it is the
 * lookup key for sign-in, the unique index, and the address every provider
 * identity was linked against — so changing it needs a verification flow this
 * app has no mailer for. `profileImage` is likewise provider-owned.
 *
 * Request:  { name }
 * Success:  200 { user: { id, name, email } }
 * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf · 422 validation
 *           · 500
 */
export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      {
        error: {
          code: "csrf_failed",
          message: "Session token missing or invalid. Refresh the page and try again.",
        },
      },
      { status: 403 },
    );
  }

  const user = await resolveSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
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

  const result = validateProfileUpdate(body);
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

  const { name } = result.data;
  /* Nothing to write. Answering 200 with the current user rather than a 422
     keeps the client's "save" idempotent — a double-click on Save must not look
     like a failure. */
  if (name === user.name) {
    return NextResponse.json({ user: publicUser(user) }, { status: 200 });
  }

  try {
    const db = await getDb();
    await db
      .collection<UserDoc>("users")
      .updateOne({ _id: user._id }, { $set: { name, updatedAt: new Date().toISOString() } });
  } catch (err) {
    console.error(
      "account/profile: failed to update name",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Couldn't save your name right now. Please try again in a moment.",
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { user: { id: user._id, name, email: user.email } },
    { status: 200 },
  );
}

/** The subset of a user document this endpoint is willing to echo back. */
function publicUser(user: UserDoc) {
  return { id: user._id, name: user.name, email: user.email };
}