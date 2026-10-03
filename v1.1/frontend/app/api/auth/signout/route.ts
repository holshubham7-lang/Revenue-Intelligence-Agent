import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { CSRF_COOKIE, csrfCookieOptions, csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { resolveSessionUser, type UserDoc } from "@/lib/auth/user";
import { getDb } from "@/lib/db";

/**
 * Ends the current session.
 *
 * Two independent layers, so neither failure leaves the caller signed in:
 *
 *  1. The `revops_session` cookie is expired, which ends this browser's session.
 *  2. The user's `tokenVersion` is rotated, which invalidates every token ever
 *     issued for the account — including stolen copies of this one.
 *
 * Layer 2 needs the database, so it is best-effort: if the write fails the
 * cookie is still cleared and the response reports `revoked: false` rather than
 * 500-ing with the session intact. The stale `revops_csrf` token is dropped in
 * the same response, since a CSRF token is only meaningful alongside a session.
 *
 * Success: 200 { ok: true, revoked: boolean }
 * Errors:  403 csrf
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

  // Rotating the token version kills every other session for this account.
  let revoked = false;
  if (user) {
    try {
      const db = await getDb();
      await db.collection<UserDoc>("users").updateOne(
        { _id: user._id },
        { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date().toISOString() } },
      );
      revoked = true;
    } catch (err) {
      // Log and carry on — the cookie is still cleared below, so the caller is
      // signed out of this browser either way.
      console.error(
        "signout: failed to rotate tokenVersion",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const response = NextResponse.json({ ok: true, revoked });
  // An expired cookie prompts the browser to drop it immediately.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  response.cookies.set(CSRF_COOKIE, "", { ...csrfCookieOptions(), maxAge: 0 });
  return response;
}
