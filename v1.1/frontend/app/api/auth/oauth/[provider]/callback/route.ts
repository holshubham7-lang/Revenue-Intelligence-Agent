import { NextResponse, NextRequest } from "next/server";

import { signInWithOAuth } from "@/lib/auth/identity";
import {
  callbackUrl,
  DEFAULT_RETURN_TO,
  exchangeCode,
  fetchProfile,
  isProviderKey,
  OAUTH_STATE_COOKIE,
  OAuthExchangeError,
  providerConfig,
  providerConfigured,
  publishStatusHint,
  verifyOAuthTransaction,
  type ProviderKey,
} from "@/lib/auth/oauth";
import { mintSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { resolveWorkspaceEntry } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where to send the browser after a social sign-in.
 *
 * An explicit `returnTo` is always honoured — that is what the deep link the
 * user actually followed asked for. When the flow carried no usable `returnTo`
 * it fell back to `DEFAULT_RETURN_TO`, and that case belongs to the onboarding
 * funnel instead: a returning user who already saved their company should land on
 * "share your data" (or the chat, once onboarding is done), not on the
 * registration form they have already submitted.
 *
 * Best-effort, like the password path: a failed company lookup falls back to
 * `DEFAULT_RETURN_TO`, which is the behaviour this replaces. It must never turn
 * a completed sign-in into an error.
 */
async function postSigninRedirect(returnTo: string, userId: string): Promise<string> {
  if (returnTo !== DEFAULT_RETURN_TO) return returnTo;
  try {
    return await resolveWorkspaceEntry(userId);
  } catch (err) {
    console.error(
      `oauth callback: could not resolve workspace entry for user ${userId}`,
      err instanceof Error ? err.message : err,
    );
    return DEFAULT_RETURN_TO;
  }
}

/**
 * The provider sends the browser back here.
 *
 * Order of operations is the security-relevant part: verify the state cookie
 * *before* doing anything with the `code`, because the code is single-use and
 * proving the callback is ours first is what stops an attacker spending it.
 *
 * Failures redirect to `/signin?error=<code>` with a message a user can act on.
 * The provider-console cases are called out explicitly, because
 * `access_denied` from Google means "your app is in Testing" to us and means
 * nothing at all to the person who was just turned away.
 */

const CLEAR_STATE_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0,
};

/**
 * Why the callback message rides in a cookie instead of the URL.
 *
 * A redirect carrying `?error=<free text from us>` leaks the text into the
 * address bar, into browser history, and into any `Referer` the next page sends.
 * httpOnly means script cannot read it back, so the sign-in page has to be a
 * server component that reads it and clears it in the same response.
 */
const ERROR_COOKIE = "revops_oauth_error";
const ERROR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 600,
  path: "/",
};

/** Also used to clear it on success, so a stale message can't linger. */
const CLEAR_ERROR_COOKIE = { ...ERROR_COOKIE_OPTIONS, maxAge: 0 };

/** `/signin?error=…` carrying a message the sign-in form can render. */
function fail(
  request: NextRequest,
  code: string,
  message: string,
  provider?: ProviderKey,
): NextResponse {
  const url = new URL("/signin", request.url);
  url.searchParams.set("error", code);
  if (provider) {
    url.searchParams.set("provider", provider);
    // `hint` explains provider-console causes, which are the majority of
    // "it works for some accounts" reports and are invisible from the error alone.
    url.searchParams.set("hint", publishStatusHint(provider));
  }

  const response = NextResponse.redirect(url, { status: 302 });
  response.cookies.set(OAUTH_STATE_COOKIE, "", CLEAR_STATE_COOKIE);
  response.cookies.set(ERROR_COOKIE, message.slice(0, 400), ERROR_COOKIE_OPTIONS);
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
  const provider = providerConfig(raw);

  if (!providerConfigured(raw)) {
    return fail(
      request,
      "not_configured",
      `${provider.label} sign-in is not configured on this deployment.`,
    );
  }

  const search = request.nextUrl.searchParams;

  /* The user pressed "Cancel" or the provider refused. */
  const providerError = search.get("error");
  if (providerError) {
    return fail(
      request,
      providerError === "access_denied" ? "access_denied" : "provider_error",
      providerError === "access_denied"
        ? `${provider.label} did not grant access. If other accounts can sign in fine, this is usually an app-configuration issue rather than anything you did.`
        : `${provider.label} returned an error (${providerError}).`,
      raw,
    );
  }

  /* State first: nothing below it can be trusted until this passes. */
  const transaction = verifyOAuthTransaction(
    request.cookies.get(OAUTH_STATE_COOKIE)?.value,
    search.get("state"),
  );

  if (!transaction) {
    return fail(
      request,
      "state_mismatch",
      "That sign-in attempt expired or didn't start from this browser. Please try again.",
    );
  }

  /* The callback path must match the one the flow was started with. */
  if (transaction.provider !== raw) {
    return fail(
      request,
      "state_mismatch",
      "That sign-in link was started for a different provider. Please try again.",
    );
  }

  const code = search.get("code");
  if (!code) {
    return fail(request, "missing_code", `${provider.label} didn't return a sign-in code.`);
  }

  try {
    const accessToken = await exchangeCode({
      provider,
      code,
      redirectUri: callbackUrl(request, raw),
      codeVerifier: transaction.codeVerifier,
    });

    const profile = await fetchProfile(provider, accessToken);
    const outcome = await signInWithOAuth(raw, profile);

    if (!outcome.ok) {
      return fail(request, outcome.code, outcome.message, raw);
    }

    const response = NextResponse.redirect(
      new URL(
        await postSigninRedirect(transaction.returnTo, outcome.user._id),
        request.url,
      ),
      { status: 302 },
    );

    /* Same session mechanism as password sign-in — one revocation path. */
    response.cookies.set(
      SESSION_COOKIE,
      mintSessionToken(outcome.user._id, outcome.user.tokenVersion),
      sessionCookieOptions(),
    );

    /* The state cookie is single-use; clear it so a replayed URL is inert. */
    response.cookies.set(OAUTH_STATE_COOKIE, "", CLEAR_STATE_COOKIE);
    /* Clear any error left by an earlier failed attempt, so the sign-in page
       can't show a stale message next to a successful session. */
    response.cookies.set(ERROR_COOKIE, "", CLEAR_ERROR_COOKIE);
    return response;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const isProviderSide = err instanceof OAuthExchangeError;
    console.error(`oauth/${raw}/callback: ${detail}`);
    return fail(
      request,
      isProviderSide ? "provider_error" : "internal_error",
      isProviderSide
        ? `${provider.label} couldn't complete the sign-in. If this happens for some accounts but not others, it's an app-configuration issue rather than anything you did.`
        : "Couldn't complete sign-in. Please try again in a moment.",
      isProviderSide ? raw : undefined,
    );
  }
}

/**
 * Some providers (and some corporate proxies) will POST `response_mode=form_post`.
 * We ask for `query` everywhere, but accepting POST too means a misconfigured
 * provider degrades to a working flow instead of a 405.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid callback." } },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }

  return GET(
    new NextRequest(url, { method: "GET", headers: request.headers }) as NextRequest,
    { params },
  );
}
