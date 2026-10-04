import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  authorizeUrl,
  beginOAuthTransaction,
  callbackUrl,
  isProviderKey,
  OAUTH_STATE_COOKIE,
  providerConfig,
  providerConfigured,
} from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shared with the callback route so both write the cookie the same way. */
const OAUTH_ERROR_COOKIE = "revops_oauth_error";

/**
 * Starts social sign-in: 302 to the provider's authorize endpoint.
 *
 * This is always reached by a top-level browser navigation, never `fetch` — the
 * provider page is cross-origin, so a scripted request would be blocked by CORS
 * and would not show the user a consent screen. Every browser handles a 302 to
 * an external origin identically.
 *
 * The state cookie is `SameSite=Lax`, which is what lets it come back with the
 * callback; see the note in `lib/auth/oauth.ts`.
 *
 * Because the button hands the browser straight here, every failure has to be a
 * redirect too. Returning JSON would render as a raw page in front of the user.
 */

/** Sends the user back to the form with a reason they can act on. */
function bounceToSignIn(
  request: NextRequest,
  code: string,
  message: string,
): NextResponse {
  const url = new URL("/signin", request.url);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url, { status: 302 });
  response.cookies.set(OAUTH_ERROR_COOKIE, message.slice(0, 400), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await params;

  if (!isProviderKey(raw)) {
    return NextResponse.json(
      { error: { code: "unknown_provider", message: "Unknown provider." } },
      { status: 404 },
    );
  }

  const config = providerConfig(raw);

  if (!providerConfigured(raw)) {
    /* Back to the form, carrying a reason. Redirecting the user *to* the
       provider when we hold no client id just produces an opaque
       `invalid_client` screen there; and this way the browser only ever needs to
       follow one redirect on our own origin. */
    return bounceToSignIn(
      request,
      "not_configured",
      `${config.label} sign-in isn't configured on this deployment.`,
    );
  }

  let redirect: string;
  try {
    const transaction = beginOAuthTransaction(
      raw,
      request.nextUrl.searchParams.get("returnTo"),
    );
    redirect = authorizeUrl(config, callbackUrl(request, raw), transaction);

    const response = NextResponse.redirect(redirect, { status: 302 });
    response.cookies.set(OAUTH_STATE_COOKIE, transaction.cookie, {
      httpOnly: true,
      // Lax, not Strict: a Strict cookie is withheld on the cross-site top-level
      // navigation back from the provider, which breaks every sign-in.
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error(`oauth/${raw}: could not start`, err instanceof Error ? err.message : err);
    return bounceToSignIn(
      request,
      "internal_error",
      "Sign-in is unavailable right now. Please try again.",
    );
  }
}
