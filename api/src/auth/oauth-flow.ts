import type { UserDoc } from "./user.ts";
import { signInWithOAuth } from "./identity.ts";
import {
  exchangeCode,
  fetchProfile,
  OAuthExchangeError,
  providerConfig,
  providerConfigured,
  verifyOAuthTransaction,
  type ProviderKey,
} from "./oauth.ts";

/**
 * The part of the OAuth callback that is the same however it ends.
 *
 * Two routes need it: the same-origin callback, which mints the session cookie
 * on the response, and the cross-origin relay callback
 * (`social-relay.controller.ts`), which mints a one-time handoff token instead
 * because the session has to appear on a different host. Anything left in
 * `AuthController` would be duplicated there, and a security check that drifts
 * between two copies is how callback validation rots.
 */
export type OAuthResolution =
  | { ok: true; user: UserDoc; returnTo: string }
  | { ok: false; code: string; message: string; provider?: ProviderKey };

/**
 * Verifies the callback, exchanges the code, and resolves the user.
 *
 * Order is the security-relevant part: the state cookie is checked *before* the
 * `code` is touched, because the code is single-use and proving the callback is
 * ours first is what stops an attacker spending it.
 */
export async function resolveOAuthCallback(input: {
  provider: ProviderKey;
  /** Provider params from the query string, or the form body, merged by the caller. */
  query: Record<string, string | undefined>;
  stateCookie: string | undefined;
  /**
   * The exact `redirect_uri` sent at authorize time. Re-sent verbatim here;
   * providers invalidate the code on any difference.
   */
  redirectUri: string;
}): Promise<OAuthResolution> {
  const { provider, query, stateCookie, redirectUri } = input;
  const config = providerConfig(provider);

  if (!providerConfigured(provider)) {
    return {
      ok: false,
      code: "not_configured",
      message: `${config.label} sign-in is not configured on this deployment.`,
    };
  }

  /* The user pressed "Cancel", or the provider refused. */
  const providerError = query.error;
  if (providerError) {
    const denied = providerError === "access_denied";
    return {
      ok: false,
      code: denied ? "access_denied" : "provider_error",
      message: denied
        ? `${config.label} did not grant access. If other accounts can sign in fine, this is usually an app-configuration issue rather than anything you did.`
        : `${config.label} returned an error (${providerError}).`,
      provider,
    };
  }

  const transaction = verifyOAuthTransaction(stateCookie, query.state);
  if (!transaction) {
    return {
      ok: false,
      code: "state_mismatch",
      message: "That sign-in attempt expired or didn't start from this browser. Please try again.",
    };
  }

  if (transaction.provider !== provider) {
    return {
      ok: false,
      code: "state_mismatch",
      message: "That sign-in link was started for a different provider. Please try again.",
    };
  }

  const code = query.code;
  if (!code) {
    return {
      ok: false,
      code: "missing_code",
      message: `${config.label} didn't return a sign-in code.`,
    };
  }

  try {
    const accessToken = await exchangeCode({
      provider: config,
      code,
      redirectUri,
      codeVerifier: transaction.codeVerifier,
    });

    const profile = await fetchProfile(config, accessToken);
    const outcome = await signInWithOAuth(provider, profile);

    if (!outcome.ok) {
      return { ok: false, code: outcome.code, message: outcome.message, provider };
    }

    return { ok: true, user: outcome.user, returnTo: transaction.returnTo };
  } catch (error: unknown) {
    const providerSide = error instanceof OAuthExchangeError;
    console.error(
      `oauth/${provider}/callback: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      ok: false,
      code: providerSide ? "provider_error" : "internal_error",
      message: providerSide
        ? `${config.label} couldn't complete the sign-in. If this happens for some accounts but not others, it's an app-configuration issue rather than anything you did.`
        : "Couldn't complete sign-in. Please try again in a moment.",
      provider: providerSide ? provider : undefined,
    };
  }
}
