"use client";

import type { ProviderKey } from "@/lib/contracts";

/**
 * Starting social sign-in from the browser.
 *
 * The flow requires a **top-level navigation**, and nothing else works. A
 * scripted request to the provider's consent page is cross-origin, so the
 * browser blocks it under CORS and the user never sees a consent screen. That is
 * why the buttons used to sit there doing nothing: `fetch` followed the 302 into
 * Google's HTML page, failed to parse it as JSON, and left the user on the same
 * screen.
 *
 * `window.location` rather than `router.push`, which is same-origin only and
 * cannot follow a cross-origin redirect.
 *
 * There is deliberately **no pre-flight probe**. An earlier version fetched the
 * start endpoint first to check for configuration errors, which meant every
 * sign-in opened two transactions and set the state cookie twice — the second
 * attempt could overwrite a cookie the provider had already been handed, and any
 * provider-side error would arrive attached to a transaction that was no longer
 * the one in play. The start endpoint now redirects back to `/signin?error=…`
 * for its own failures, so one navigation covers both outcomes.
 *
 * "Works in every browser" here means: no popup, no `window.opener`, no
 * third-party cookie, and no reliance on a fetch response mode. It is a plain
 * sequence of same-origin and cross-origin top-level GETs, which is the one
 * navigation shape Safari, Firefox, Chrome and Edge all implement identically —
 * including Safari with Intelligent Tracking Prevention and third-party cookies
 * globally blocked.
 */

export type OAuthStartResult =
  | { ok: true; navigated: true }
  | { ok: false; message: string };

/**
 * Hands the browser to our own endpoint, which 302s on to the provider.
 *
 * `router.push` and `redirect()` are both wrong here, and the lint rule that
 * suggests them is the reason this is isolated in one function:
 *
 * - `redirect()` is documented as render-phase only — calling it from this event
 *   handler does nothing useful.
 * - `router.push` only performs same-origin client transitions and cannot follow
 *   the cross-origin redirect to the provider's consent page.
 * - `window.location` is what the Next docs point to for external URLs, and a
 *   full document load is additionally required because the provider's consent
 *   screen must render as a real page, not a client-side route.
 *
 * The URL is a hard-coded, same-origin path built from a literal provider key, so
 * the rule's XSS concern about relative destinations does not apply.
 */
function navigateAway(path: string): void {
  window.location.assign(path);
}

/**
 * Hands the browser to the provider.
 *
 * Synchronous on purpose. An `async` version that awaited anything before
 * navigating could be interrupted — a re-render, a fast click on another
 * provider, the page being hidden — and the user would be left on a spinner that
 * never resolves, with no explanation. Navigating in the same tick as the click
 * is the most reliable thing a browser offers.
 *
 * Returns only to tell the caller the hand-off happened. `ok: false` is returned
 * solely when the *call itself* could not be issued, which in practice means the
 * endpoint was unreachable — the endpoint's own errors arrive as a redirect back
 * to `/signin`.
 */
export function startOAuth(provider: ProviderKey): OAuthStartResult {
  try {
    navigateAway(`/api/auth/oauth/${provider}`);
    return { ok: true, navigated: true };
  } catch {
    return {
      ok: false,
      message:
        typeof navigator !== "undefined" && !navigator.onLine
          ? "You're offline. Check your connection and try again."
          : "Couldn't start sign-in. Please try again.",
    };
  }
}
