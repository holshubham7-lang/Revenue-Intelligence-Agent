import { HttpStatus } from "@nestjs/common";
import type { Response } from "express";

import { clearCookie, setCookie } from "../common/http";
import { loadConfig } from "../common/config";
import { mintSessionToken, SESSION_COOKIE, sessionCookieOptions } from "./session.ts";
import { OAUTH_STATE_COOKIE, publishStatusHint, type ProviderKey } from "./oauth.ts";

/**
 * The OAuth cookie names and the two browser-facing failure redirects.
 *
 * Shared by `auth.controller.ts` (same-origin flow) and
 * `social-relay.controller.ts` (cross-origin relay) because both must write the
 * state and error cookies with *identical* attributes: if the start route and a
 * failure route disagree on a cookie name or its `SameSite`, the message set by
 * one is invisible to the page that reads the other, and the user sees a silent
 * bounce back to the sign-in form.
 */

/**
 * The message the callback leaves for `/signin`.
 *
 * httpOnly, so the sign-in page must be a server component that reads it and
 * clears it in the same response. A redirect carrying `?error=<text>` instead
 * would leak the text into the address bar, browser history, and the next
 * page's `Referer`.
 */
export const OAUTH_ERROR_COOKIE = "revops_oauth_error";

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
});

/**
 * The OAuth state cookie is single-use and short-lived.
 *
 * `SameSite=Lax` rather than Strict on purpose: a Strict cookie is withheld on the
 * cross-site top-level navigation back from the provider, which would break every
 * sign-in.
 */
export const setOAuthStateCookie = (response: Response, cookie: string): void => {
  setCookie(response, OAUTH_STATE_COOKIE, cookie, cookieOptions(600));
};

/**
 * Expires the state cookie on *this* response's origin.
 *
 * `completeSignIn` does this as part of signing in, but the cross-origin relay
 * signs in on a different host: the cookie was set by the API origin and only the
 * session ends up on the frontend, so without this call the API origin would keep
 * a live state cookie for the full ten minutes after the sign-in finished.
 */
export const clearOAuthStateCookie = (response: Response): void => {
  clearCookie(response, OAUTH_STATE_COOKIE, cookieOptions(0));
};

/**
 * Redirects back to the browser-facing origin.
 *
 * Built from `APP_BASE_URL`, never from this request's `Host`. The API sits
 * behind the Next.js rewrite on `:3010`, so `request.url` would send the user to
 * the API's own origin — a 404 on a page that looks like the app. In relay mode
 * the API *is* addressed on its own origin, which makes this even more load
 * bearing: a relative redirect there would 404 on the API host.
 */
function redirectToBrowser(response: Response, path: string): void {
  response.redirect(HttpStatus.FOUND, new URL(path, loadConfig().appBaseUrl).toString());
}

/** Back to the form with a reason, from the OAuth *start* route. */
export function bounceToSignIn(response: Response, code: string, message: string): void {
  const url = new URL("/signin", loadConfig().appBaseUrl);
  url.searchParams.set("error", code);
  setCookie(response, OAUTH_ERROR_COOKIE, message.slice(0, 400), cookieOptions(600));
  response.redirect(HttpStatus.FOUND, url.toString());
}

/** Back to the form from the callback, also explaining provider-console causes. */
export function failOAuth(
  response: Response,
  code: string,
  message: string,
  provider?: ProviderKey,
): void {
  const url = new URL("/signin", loadConfig().appBaseUrl);
  url.searchParams.set("error", code);
  if (provider) {
    url.searchParams.set("provider", provider);
    /* Explains provider-console causes, which are the majority of "works for some
       accounts" reports and are invisible from the error alone. */
    url.searchParams.set("hint", publishStatusHint(provider));
  }
  clearCookie(response, OAUTH_STATE_COOKIE, cookieOptions(0));
  setCookie(response, OAUTH_ERROR_COOKIE, message.slice(0, 400), cookieOptions(600));
  response.redirect(HttpStatus.FOUND, url.toString());
}

/**
 * Opens the session on this origin and sends the browser to its destination.
 *
 * Both callback paths end here — the same-origin one and the relay endpoint the
 * cross-origin one bounces to — so the cookie attributes, the single-use cookie
 * clearing, and the `returnTo` handling can never drift between the two.
 *
 * The session is the *only* thing that persists past this response; both OAuth
 * cookies are expired on purpose, so a replayed callback URL is inert and a stale
 * error message cannot appear beside a freshly established session.
 */
export function completeSignIn(
  response: Response,
  input: { userId: string; tokenVersion: number; returnTo: string },
): void {
  /* Same session mechanism as password sign-in — one revocation path. */
  setCookie(
    response,
    SESSION_COOKIE,
    mintSessionToken(input.userId, input.tokenVersion),
    sessionCookieOptions(),
  );
  clearCookie(response, OAUTH_STATE_COOKIE, cookieOptions(0));
  clearCookie(response, OAUTH_ERROR_COOKIE, cookieOptions(0));

  /* `returnTo` passed `safeReturnTo`, so this is an allowlisted internal path —
     never an open redirect. */
  redirectToBrowser(response, input.returnTo);
}
