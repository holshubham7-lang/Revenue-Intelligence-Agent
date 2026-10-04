import { HttpStatus } from "@nestjs/common";
import type { Express, Request, Response } from "express";

import { loadConfig } from "../common/config";
import { readFormBody, readQuery } from "../common/http";
import {
  authorizeUrl,
  beginOAuthTransaction,
  isProviderKey,
  OAUTH_STATE_COOKIE,
  providerConfig,
  providerConfigured,
  type ProviderKey,
} from "./oauth.ts";
import { resolveOAuthCallback } from "./oauth-flow.ts";
import {
  bounceToSignIn,
  clearOAuthStateCookie,
  failOAuth,
  setOAuthStateCookie,
} from "./oauth-outcomes.ts";
import { createRelayToken, relayCallbackUrl, relayOrigin } from "./oauth-relay.ts";

/**
 * Social sign-in on the origin the provider consoles know about.
 *
 * A provider sends the browser back to the exact registered `redirect_uri` and
 * nothing else, and for this deployment those entries point at the **API's own
 * host**, while the product — and therefore the session cookie — lives on the
 * frontend host. So this is a relay: it runs the real OAuth transaction on the API
 * origin, where its own state cookie is set and read like any other, then hands
 * the browser to the frontend's `/api/auth/oauth/relay` carrying a one-time token.
 * `oauth-relay.ts` explains why the handoff is a second credential rather than the
 * session itself.
 *
 * ## Why plain Express routes rather than a Nest controller
 *
 * Every other route in this service is served under the `/api` prefix so the
 * Next.js rewrite can be a transparent pass-through. These paths have to be
 * exactly `/auth/social/<provider>/callback`, prefix-free, or the provider's
 * comparison fails for the same reason it does today. Rather than thread a global
 * prefix exclusion through `main.ts` for two routes, they are mounted directly on
 * the adapter's Express instance, where the path written here is the path served.
 * `main.ts` registers this after the cookie and form parsers, so both are
 * available — `form_post` callbacks arrive urlencoded.
 *
 * Everything here is inert unless `AUTH_RELAY_URL` is set; a deployment whose
 * consoles point at the frontend origin keeps using `auth.controller.ts` alone.
 */
export function registerSocialRelay(server: Express): void {
  server.get("/auth/social/:provider", (request, response) => {
    start(request, response);
  });

  const callback = (request: Request, response: Response): void => {
    /* Nothing below may throw into Express: there is no Nest exception filter on
       this path, and an escaped rejection would leave the browser spinning on a
       redirect it never receives. `resolveOAuthCallback` already swallows provider
       and database faults; this is the backstop for anything else. */
    completeCallback(request, response).catch((error: unknown) => {
      console.error("social relay: callback failed", error instanceof Error ? error.message : error);
      failOAuth(response, "internal_error", "Couldn't complete sign-in. Please try again in a moment.");
    });
  };

  server.get("/auth/social/:provider/callback", callback);
  /* Accepted so a provider or corporate proxy that posts `response_mode=form_post`
     degrades into a working flow rather than a 405. */
  server.post("/auth/social/:provider/callback", callback);
}

/**
 * Begins the transaction and redirects to the provider.
 *
 * Reached by the bounce from `GET /api/auth/oauth/:provider` on the frontend, so
 * `returnTo` has been allowlisted once already — it is checked again rather than
 * trusted, because this path is publicly addressable.
 */
function start(request: Request, response: Response): void {
  const provider = providerOf(request);
  if (!provider) {
    bounceToSignIn(response, "unknown_provider", "Unknown sign-in provider.");
    return;
  }
  if (!usable(response)) {
    return;
  }

  if (!providerConfigured(provider)) {
    bounceToSignIn(response, "not_configured",
      `${providerConfig(provider).label} sign-in isn't configured on this deployment.`);
    return;
  }

  try {
    const transaction = beginOAuthTransaction(provider, request.query.returnTo);
    const redirect = authorizeUrl(
      providerConfig(provider),
      relayCallbackUrl(provider),
      transaction,
    );

    /* Set on this response, which is served from the API origin — so this is the
       origin that gets to show the provider's callback request the cookie back. */
    setOAuthStateCookie(response, transaction.cookie);
    response.redirect(HttpStatus.FOUND, redirect);
  } catch (error: unknown) {
    console.error(`social/${provider}: could not start`, error instanceof Error ? error.message : error);
    bounceToSignIn(response, "internal_error", "Sign-in is unavailable right now. Please try again.");
  }
}

async function completeCallback(request: Request, response: Response): Promise<void> {
  const provider = providerOf(request);
  if (!provider) {
    bounceToSignIn(response, "unknown_provider", "Unknown sign-in provider.");
    return;
  }
  if (!usable(response)) {
    return;
  }

  /* Query wins on a collision so a crafted query string cannot shadow the body. */
  const query = { ...readFormBody(request), ...readQuery(request) };

  const resolved = await resolveOAuthCallback({
    provider,
    query,
    stateCookie: request.cookies?.[OAUTH_STATE_COOKIE],
    /* Re-derived from the same function that built the authorize request; any
       difference makes the provider invalidate the code. */
    redirectUri: relayCallbackUrl(provider),
  });

  /* Single-use either way: this origin held it and only this response can expire
     it. Done before branching so neither path escapes it. */
  clearOAuthStateCookie(response);

  if (!resolved.ok) {
    failOAuth(response, resolved.code, resolved.message, resolved.provider);
    return;
  }

  const token = createRelayToken({
    userId: resolved.user._id,
    tokenVersion: resolved.user.tokenVersion,
    returnTo: resolved.returnTo,
  });

  /* The frontend origin, from `APP_BASE_URL` — never this request's `Host`, which
     on the API app is the API itself. */
  const handoff = new URL("/api/auth/oauth/relay", loadConfig().appBaseUrl);
  handoff.searchParams.set("token", token);
  response.redirect(HttpStatus.FOUND, handoff.toString());
}

/**
 * The route param as a provider key, or null.
 *
 * Express types params `string | string[]` even for a non-extended route, so the
 * narrowing happens here once rather than at every use — and an array must not
 * reach `isProviderKey`, which would compare a joined string.
 */
function providerOf(request: Request): ProviderKey | null {
  const raw = request.params.provider;
  return typeof raw === "string" && isProviderKey(raw) ? raw : null;
}

/**
 * Refuses a request this relay cannot serve correctly.
 *
 * Two misconfigurations, both silent without this: `AUTH_RELAY_URL` unset (this
 * origin then has no console registration to answer), and `APP_BASE_URL` pointed
 * back at the API host (every redirect below, failures included, would then land
 * on a 404 that looks like the app). Failing loudly is cheaper than a sign-in that
 * appears to work and never completes.
 */
function usable(response: Response): boolean {
  const origin = relayOrigin();
  if (!origin || new URL(loadConfig().appBaseUrl).origin === origin) {
    console.error("social relay: refusing request — AUTH_RELAY_URL unset or equal to APP_BASE_URL");
    failOAuth(response, "relay_misconfigured", "Social sign-in is unavailable right now. Please try again.");
    return false;
  }
  return true;
}
