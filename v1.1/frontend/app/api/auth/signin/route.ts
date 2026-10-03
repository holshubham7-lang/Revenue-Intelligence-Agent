import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { verifyPassword } from "@/lib/auth/password";
import { mintSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { validateSignin } from "@/lib/auth/validation";
import { findUserByEmail } from "@/lib/auth/user";
import { resolveWorkspaceEntry } from "@/lib/onboarding";

/**
 * The workspace screen to send this user to after signing in.
 *
 * Best-effort by design: a failure to read the company record must not turn a
 * successful, credential-verified sign-in into a 500. Falling back to
 * `"/company"` reproduces the old behaviour exactly, so the worst case here is
 * the bug this replaces rather than a locked-out user.
 */
async function signinRedirect(userId: string): Promise<string> {
  try {
    return await resolveWorkspaceEntry(userId);
  } catch (err) {
    console.error(
      "signin: could not resolve workspace entry",
      err instanceof Error ? err.message : err,
    );
    return "/company";
  }
}

/**
 * Password sign-in with the same defences as signup.
 *
 * CSRF-checked, field-validated on the server, and credential-verified with
 * scrypt. Failing logins return the same generic message whether the email is
 * unknown or the password is wrong, so the endpoint never reveals which
 * addresses exist. Social-only accounts (e.g. Google) have no password hash and
 * therefore always fail the generic path.
 *
 * On success a signed session cookie (`revops_session`) is set in the response,
 * which the `/company` layout reads to identify the signed-in user.
 *
 * The response also carries `redirectTo`: the workspace screen this user's
 * onboarding state points at, so a returning user who already finished the
 * company form lands on "share your data" rather than on a form they have
 * already submitted. Decided here rather than in the client because this is
 * where the session is minted and the company record is one indexed read away.
 *
 * Request:  { email, password }
 * Success:  200 { user: { id, name, email }, redirectTo } + Set-Cookie: revops_session
 * Errors:   400 invalid_json · 403 csrf · 422 validation · 401 bad credentials
 *           · 403 account blocked · 500
 */
export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      { error: { code: "csrf_failed", message: "Session token missing or invalid. Refresh the page and try again." } },
      { status: 403 },
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

  const result = validateSignin(body);
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

  const { email, password } = result.data;

  try {
    const user = await findUserByEmail(email);

    // Same response for unknown email and wrong password — no account probing.
    if (!user || user.authProvider !== "password" || !user.passwordHash) {
      return NextResponse.json(
        { error: { code: "invalid_credentials", message: "The email or password you entered is incorrect." } },
        { status: 401 },
      );
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { error: { code: "account_blocked", message: "This account has been blocked. Contact support." } },
        { status: 403 },
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: { code: "invalid_credentials", message: "The email or password you entered is incorrect." } },
        { status: 401 },
      );
    }

    /* Mint the session cookie and set it on the response. */
    const response = NextResponse.json({
      user: { id: user._id, name: user.name, email: user.email },
      redirectTo: await signinRedirect(user._id),
    });
    response.cookies.set(
      SESSION_COOKIE,
      mintSessionToken(user._id, user.tokenVersion),
      sessionCookieOptions(),
    );
    return response;
  } catch (err) {
    console.error("signin: failed lookup", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Couldn't sign you in right now. Please try again in a moment." } },
      { status: 500 },
    );
  }
}