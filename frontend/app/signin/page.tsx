import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth/AuthHeader";
import { BrandPanel } from "@/components/signup/BrandPanel";
import { SignInForm } from "@/components/auth/SignInForm";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { resolveWorkspaceEntry } from "@/lib/onboarding";
import { signin, site } from "@/lib/content";

export const metadata: Metadata = {
  title: signin.meta.title,
  description: signin.meta.description,
};

/** The callback writes a human-readable reason here; it is single-use. */
const OAUTH_ERROR_COOKIE = "revops_oauth_error";

/**
 * Only codes this page knows how to describe are shown verbatim.
 *
 * Must stay in step with every `code` the auth service can put in the query
 * string. A code missing from this set is not merely shown with generic wording
 * — `showError` goes false, so the page renders the form with **no message at
 * all** and a signed-in visitor is redirected onward. That turns a real
 * misconfiguration into a button that appears to do nothing, which is the
 * hardest kind of auth bug to report: the user cannot see the reason and the
 * service logs nothing either. `relay_expired` and `relay_misconfigured` are the
 * two the cross-origin relay adds (see api/src/auth/oauth-relay.ts).
 */
const KNOWN_ERRORS = new Set([
  "access_denied",
  "provider_error",
  "state_mismatch",
  "missing_code",
  "email_not_verified",
  "account_blocked",
  "not_configured",
  "internal_error",
  "relay_expired",
  "relay_misconfigured",
]);

const ERROR_COPY: Record<string, string> = {
  access_denied:
    "Sign-in was cancelled or the provider refused the request. If this keeps happening on one account but not others, it's an app-configuration issue rather than anything you did.",
  provider_error:
    "The provider couldn't complete the sign-in. This is usually an app-configuration issue rather than anything you did.",
  state_mismatch:
    "That sign-in attempt expired or didn't start from this browser. Please try again.",
  missing_code: "The provider didn't return a sign-in code. Please try again.",
  email_not_verified:
    "That provider hasn't verified this email address, so we can't link it to your existing account. Sign in with your password instead.",
  account_blocked: "This account has been blocked. Contact support.",
  not_configured: "That sign-in method isn't configured on this deployment.",
  internal_error: "Couldn't complete sign-in. Please try again in a moment.",
  relay_expired:
    "That sign-in link had already been used, or it expired before it arrived. Please start again.",
  relay_misconfigured:
    "Social sign-in isn't set up correctly on this deployment. Please contact support.",
};

/**
 * The workspace screen an already-authenticated visitor should be sent to, or
 * `null` when there is no usable session and the form should render instead.
 *
 * Returns the destination rather than calling `redirect()` so the page can keep
 * it outside a `try`: `redirect()` works by throwing a sentinel, so a blanket
 * `catch` around it would catch the navigation too and swallow it.
 */
async function entryForExistingSession(token: string | undefined): Promise<string | null> {
  try {
    const user = await resolveSessionUser(token);
    return user ? await resolveWorkspaceEntry(user._id) : null;
  } catch (err) {
    // A stale cookie we cannot read is not a reason to hide the sign-in form.
    console.error(
      "signin: could not resolve workspace entry for existing session",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * The sign-in page — same full-height split screen as `/signup`: the left panel
 * carries the brand story (swapped to sign-in copy), the right column holds the
 * credentials form. Only `SignInForm` ships JavaScript.
 *
 * A failed social attempt bounces back here with `?error=`. The detailed reason
 * lives in an httpOnly cookie rather than the query string, because that reason
 * can describe an account (an unverified address matching an existing account, a
 * blocked account) and query strings end up in browser history, server logs, and
 * the `Referer` of the next navigation.
 *
 * ## Why the cookie is never cleared here
 *
 * A Server Component cannot set cookies, so the message is not cleared on read.
 * That is safe because the cookie is only ever *read* when `?error=` is present,
 * and that query parameter is only ever written by a callback that has just set
 * a fresh cookie in the same response. A plain later visit to `/signin` carries
 * no `?error=`, so `showError` is false and the cookie is ignored. The pairing —
 * a fresh cookie and its `?error=` marker arrive together — is what makes it
 * single-use without needing to delete anything.
 *
 * ## Why a signed-in visitor is sent onwards
 *
 * Someone whose session cookie is still valid has no business on this page — the
 * form would authenticate them again and overwrite a good session. They are
 * redirected to wherever their onboarding state points, which is the same
 * destination a fresh sign-in would have chosen.
 *
 * Two deliberate carve-outs. A URL carrying `?error=` is always rendered, so a
 * social attempt that failed leaves the reason visible instead of silently
 * bouncing the user into the workspace on a cookie from an earlier session. And
 * any failure resolving the session or the company record falls through to
 * rendering the form, which is strictly better than a 500 — the lookup is
 * deliberately outside the `redirect()` call because that helper signals by
 * throwing, and a blanket `catch` would swallow the navigation.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; hint?: string }>;
}) {
  const { error, hint } = await searchParams;
  const jar = await cookies();

  const cookieMessage = jar.get(OAUTH_ERROR_COOKIE)?.value;
  const showError = error && KNOWN_ERRORS.has(error);

  // Prefer the cookie: it carries the specific reason. Fall back to the code's
  // own wording when the cookie is missing (direct visit to `?error=`).
  const initialError = showError
    ? cookieMessage ?? ERROR_COPY[error] ?? signin.form.errors.server
    : null;

  /* An unexpired session means this person is already authenticated, so the form
     would only overwrite a good session. Send them onward — unless the URL is
     reporting a failed social attempt, which has to render so the reason shows. */
  if (!showError) {
    const entry = await entryForExistingSession(jar.get(SESSION_COOKIE)?.value);
    if (entry) redirect(entry);
  }

  return (
    <main className="min-h-[100svh] bg-bg lg:grid lg:grid-cols-2">
      {/* Left: brand story (desktop) */}
      <BrandPanel panel={signin.panel} />

      {/* Right: form column */}
      <section className="flex flex-col">
        {/* Top bar — brand (mobile) + back home */}
        <AuthHeader brandInPanel backHome />

        {/* Form */}
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <SignInForm initialError={initialError} initialHint={showError ? hint : null} />
        </div>

        {/* Slim credit */}
        <p className="shrink-0 px-5 pb-6 text-center text-xs text-ink-subtle sm:px-8">
          {site.copyright.prefix}{" "}
          <a
            href={site.copyright.brandHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-medium text-ink transition-colors duration-200 ease-out hover:text-brand"
          >
            {site.copyright.brandLabel}
          </a>
          {site.copyright.suffix}
        </p>
      </section>
    </main>
  );
}