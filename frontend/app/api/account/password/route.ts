import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { mintSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { validatePasswordChange } from "@/lib/auth/validation";
import { resolveSessionUser, type UserDoc } from "@/lib/auth/user";
import { getDb } from "@/lib/db";

/**
 * Changes the signed-in user's password.
 *
 * Three things happen, in this order, and the order matters:
 *
 *  1. The current password is verified. Without it this would be a
 *     password *setter* reachable from any live session, so a stolen cookie
 *     could lock the real owner out permanently.
 *  2. `tokenVersion` is incremented, which invalidates every session token ever
 *     issued for this account — the same revocation sign-out uses. A password
 *     change that left other sessions alive would defeat the point of making it.
 *  3. A fresh session cookie is minted at the new version and returned, so the
 *     browser making the request stays signed in. Without this step the user
 *     would be logged out of the tab they just used to change their password.
 *
 * Request:  { currentPassword, newPassword, confirmPassword }
 * Success:  200 { ok: true } + Set-Cookie: revops_session (new version)
 * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf · 422 validation
 *           · 400 wrong_current / no_password · 500
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

  const result = validatePasswordChange(body);
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

  const { currentPassword, newPassword } = result.data;

  /* A social-only account has no password to verify and no hash to replace.
     Refusing is the only safe answer: silently succeeding would claim to have
     set a password on an account whose sign-in still goes through the provider. */
  if (user.authProvider !== "password" || !user.passwordHash) {
    return NextResponse.json(
      {
        error: {
          code: "no_password",
          message: "This account signs in with a work account, so it has no password to change.",
        },
      },
      { status: 400 },
    );
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json(
      {
        error: {
          code: "wrong_current",
          message: "That isn't your current password.",
          fields: { currentPassword: "That isn't your current password." },
        },
      },
      { status: 400 },
    );
  }

  const nextVersion = user.tokenVersion + 1;

  try {
    const db = await getDb();
    const updated = await db.collection<UserDoc>("users").updateOne(
      { _id: user._id, tokenVersion: user.tokenVersion },
      {
        $set: {
          passwordHash: hashPassword(newPassword),
          updatedAt: new Date().toISOString(),
        },
        $inc: { tokenVersion: 1 },
      },
    );
    /* The `tokenVersion` in the filter is the optimistic lock: two concurrent
       changes can only both match the version they read, so the second one finds
       no document and cannot silently skip the other's revocation. */
    if (updated.matchedCount === 0) {
      return NextResponse.json(
        {
          error: {
            code: "conflict",
            message: "Your password was just changed somewhere else. Please sign in again.",
          },
        },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error(
      "account/password: failed to update password",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Couldn't update your password right now. Please try again in a moment.",
        },
      },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  /* Keeps this browser signed in at the new version. Every other session is now
     stale and will fail its next `resolveSessionUser` check. */
  response.cookies.set(
    SESSION_COOKIE,
    mintSessionToken(user._id, nextVersion),
    sessionCookieOptions(),
  );
  return response;
}