import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ObjectId } from "mongodb";
import type { MongoServerError } from "mongodb";
import type { Request, Response } from "express";

import {
  ApiError,
  conflict,
  internal,
  notFound,
  unauthorized,
  unprocessable,
} from "../common/api-error";
import { assertCsrf, readFormBody, readJson, readQuery, setCookie, toRequestLike } from "../common/http";
import {
  CSRF_COOKIE,
  csrfCookieOptions,
  generateCsrfToken,
} from "./csrf.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import {
  mintSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "./session.ts";
import { validateSignin, validateSignup } from "./validation.ts";
import { getDb } from "../db.ts";
import { findUserByEmail, type UserDoc } from "./user.ts";
import {
  authorizeUrl,
  beginOAuthTransaction,
  callbackUrl,
  isProviderKey,
  OAUTH_STATE_COOKIE,
  providerConfig,
  providerConfigured,
  safeReturnTo,
  type ProviderKey,
} from "./oauth.ts";
import { resolveOAuthCallback } from "./oauth-flow.ts";
import {
  consumeRelayToken,
  relayEnabled,
  relayStartUrl,
} from "./oauth-relay.ts";
import {
  bounceToSignIn,
  completeSignIn,
  failOAuth,
  setOAuthStateCookie,
} from "./oauth-outcomes.ts";
import { OptionalUser } from "./session.interceptor.ts";

@Controller("auth")
export class AuthController {
  /* ---------------------------------------------------------------------- */
  /* CSRF                                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Issues a fresh CSRF token.
   *
   * Set in the `revops_csrf` cookie (readable by client JS) and returned in the
   * body so forms can echo it back in the `X-CSRF-Token` header.
   */
  @Get("csrf")
  issueCsrf(@Res({ passthrough: true }) response: Response) {
    const token = generateCsrfToken();
    setCookie(response, CSRF_COOKIE, token, csrfCookieOptions());
    return { csrfToken: token };
  }

  /* ---------------------------------------------------------------------- */
  /* Password auth                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Account creation with server-side validation.
   *
   * Validates each field, hashes the password with scrypt, and stores the user in
   * the `users` collection. The unique index on `email` is the final guard
   * against duplicates; the 409 path stays race-free.
   *
   * Request:  { name, email, password }
   * Success:  201 { user: { id, name, email } }   (never returns the password)
   * Errors:   400 invalid_json · 422 validation · 409 email_exists · 403 csrf · 500
   */
  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  async signup(@Req() request: Request) {
    assertCsrf(request);

    const result = validateSignup(await readJson(request));
    if (!result.ok) {
      throw unprocessable("validation_failed", "Please fix the highlighted fields.", result.fields);
    }

    const { name, email, password } = result.data;
    const now = new Date().toISOString();
    const id = new ObjectId().toHexString();

    const doc: UserDoc = {
      _id: id,
      name,
      email,
      passwordHash: hashPassword(password),
      authProvider: "password",
      isEmailVerified: false,
      isBlocked: false,
      isTestAccount: false,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const db = await getDb();
      await db.collection<UserDoc>("users").insertOne(doc);
    } catch (error: unknown) {
      /* The unique index is the authority on duplicates; a validation-layer
         check would still race two concurrent signups. */
      if ((error as MongoServerError).code === 11000) {
        throw conflict("email_exists", "An account with this email already exists.");
      }
      console.error("signup: failed to insert user", error instanceof Error ? error.message : error);
      throw internal("Couldn't create your account right now. Please try again in a moment.");
    }

    return { user: { id, name, email } };
  }

  /**
   * Password sign-in with the same defences as signup.
   *
   * Failing logins return the same generic message whether the email is unknown
   * or the password is wrong, so the endpoint never reveals which addresses
   * exist. Social-only accounts have no password hash and always fail the
   * generic path.
   *
   * Request:  { email, password }
   * Success:  200 { user: { id, name, email } } + Set-Cookie: revops_session
   * Errors:   400 invalid_json · 403 csrf · 422 validation · 401 bad credentials
   *           · 403 account blocked · 500
   */
  @Post("signin")
  @HttpCode(HttpStatus.OK)
  async signin(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertCsrf(request);

    const result = validateSignin(await readJson(request));
    if (!result.ok) {
      throw unprocessable("validation_failed", "Please fix the highlighted fields.", result.fields);
    }

    const { email, password } = result.data;

    try {
      const user = await findUserByEmail(email);

      /* One message for unknown email, social-only account, and wrong password:
         anything more specific turns this endpoint into an account oracle. */
      if (!user || user.authProvider !== "password" || !user.passwordHash) {
        throw unauthorized("invalid_credentials", "The email or password you entered is incorrect.");
      }

      if (user.isBlocked) {
        throw new ApiError(HttpStatus.FORBIDDEN, "account_blocked", "This account has been blocked. Contact support.");
      }

      if (!verifyPassword(password, user.passwordHash)) {
        throw unauthorized("invalid_credentials", "The email or password you entered is incorrect.");
      }

      /* Same session mechanism as social sign-in — one revocation path. */
      setCookie(
        response,
        SESSION_COOKIE,
        mintSessionToken(user._id, user.tokenVersion),
        sessionCookieOptions(),
      );
      return { user: { id: user._id, name: user.name, email: user.email } };
    } catch (error: unknown) {
      /* `ApiError` carries a deliberate, safe message; anything else is a fault. */
      if (error instanceof ApiError) throw error;
      console.error("signin: failed lookup", error instanceof Error ? error.message : error);
      throw internal("Couldn't sign you in right now. Please try again in a moment.");
    }
  }

  /**
   * Ends the current session.
   *
   * Two independent layers, so neither failure leaves the caller signed in:
   *
   *  1. The `revops_session` cookie is expired, ending this browser's session.
   *  2. The user's `tokenVersion` is rotated, invalidating every token ever
   *     issued for the account — including stolen copies of this one.
   *
   * Layer 2 needs the database, so it is best-effort: if the write fails the
   * cookie is still cleared and the response reports `revoked: false` rather than
   * failing with the session intact.
   *
   * Success: 200 { ok: true, revoked: boolean }
   */
  @Post("signout")
  @HttpCode(HttpStatus.OK)
  async signout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @OptionalUser() user: UserDoc | null,
  ) {
    assertCsrf(request);

    let revoked = false;
    if (user) {
      try {
        const db = await getDb();
        await db.collection<UserDoc>("users").updateOne(
          { _id: user._id },
          { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date().toISOString() } },
        );
        revoked = true;
      } catch (error: unknown) {
        /* Cleared below regardless, so the caller is signed out of this browser
           either way. Only other sessions survive. */
        console.error("signout: failed to rotate tokenVersion", error instanceof Error ? error.message : error);
      }
    }

    /* An expired cookie prompts the browser to drop it immediately. The stale
       CSRF token goes with it — it is only meaningful alongside a session. */
    setCookie(response, SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    setCookie(response, CSRF_COOKIE, "", { ...csrfCookieOptions(), maxAge: 0 });
    return { ok: true, revoked };
  }

  /**
   * Password reset request.
   *
   * A **seam**, not an implementation — the shape below is the contract
   * `ForgotPasswordForm.tsx` talks to. When a mailer exists, replace the body;
   * it must then always answer 200 regardless of whether the address exists.
   */
  @Post("forgot-password")
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  async forgotPassword(@Req() request: Request) {
    const body = await readJson<{ email?: string }>(request);
    if (!body.email) {
      throw unprocessable("missing_fields", "Email is required.");
    }
    throw new ApiError(
      HttpStatus.NOT_IMPLEMENTED,
      "not_configured",
      "Password reset is not connected yet.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Social auth                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Spends a relay handoff token and opens the session.
   *
   * Declared before `oauth/:provider` on purpose: Nest matches handlers in
   * declaration order, so the more specific literal path has to come first or
   * `relay` would be read as a provider name and rejected.
   *
   * This is reached through the frontend origin, which is the entire point: the
   * cookie set here belongs to the host whose pages read it.
   */
  @Get("oauth/relay")
  oauthRelayComplete(
    @Query("token") token: string | undefined,
    @Res() response: Response,
  ): void {
    const claims = consumeRelayToken(token);
    if (!claims) {
      /* Expired, forged, or already spent. Nothing here distinguishes the three,
         and none of them should tell an attacker which one it was. */
      bounceToSignIn(response, "relay_expired",
        "That sign-in link was already used or has expired. Please try again.");
      return;
    }

    completeSignIn(response, claims);
  }

  /**
   * Starts social sign-in: 302 to the provider's authorize endpoint.
   *
   * Always reached by a top-level browser navigation, never `fetch` — the
   * provider page is cross-origin, so a scripted request would be blocked by
   * CORS and would not show a consent screen.
   *
   * Because the button hands the browser straight here, every failure is a
   * redirect too. Returning JSON would render as a raw page in front of the user.
   */
  @Get("oauth/:provider")
  startOAuth(
    @Param("provider") raw: string,
    @Query("returnTo") returnTo: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    const provider = this.requireProvider(raw);

    if (!providerConfigured(provider)) {
      /* Back to the form with a reason. Redirecting to the provider while we
         hold no client id only produces an opaque `invalid_client` screen
         there. */
      bounceToSignIn(response, "not_configured",
        `${providerConfig(provider).label} sign-in isn't configured on this deployment.`);
      return;
    }

    /* Relay mode: the provider only ever sends the browser back to the origin
       recorded in its console, which for this deployment is the API's own host
       rather than this one. So the browser goes there and
       `social-relay.controller.ts` takes the transaction over — including the
       state cookie, which has to be set on the origin that will be shown it.
       Nothing crosses but `returnTo`, allowlisted here and re-checked on the way
       back in. */
    if (relayEnabled()) {
      const url = new URL(relayStartUrl(provider));
      url.searchParams.set("returnTo", safeReturnTo(returnTo));
      response.redirect(HttpStatus.FOUND, url.toString());
      return;
    }

    try {
      const transaction = beginOAuthTransaction(provider, returnTo);
      const redirect = authorizeUrl(
        providerConfig(provider),
        callbackUrl(toRequestLike(request), provider),
        transaction,
      );

      setOAuthStateCookie(response, transaction.cookie);
      response.redirect(HttpStatus.FOUND, redirect);
    } catch (error: unknown) {
      console.error(`oauth/${provider}: could not start`, error instanceof Error ? error.message : error);
      bounceToSignIn(response, "internal_error", "Sign-in is unavailable right now. Please try again.");
    }
  }

  /**
   * The provider sends the browser back here.
   *
   * Order of operations is the security-relevant part: verify the state cookie
   * *before* touching the `code`, because the code is single-use and proving the
   * callback is ours first is what stops an attacker spending it.
   *
   * Failures redirect to `/signin?error=<code>` with a message the user can act
   * on. The provider-console cases are called out explicitly, because
   * `access_denied` from Google means "your app is in Testing" to us and means
   * nothing to the person just turned away.
   */
  @Get("oauth/:provider/callback")
  oauthCallbackGet(
    @Param("provider") raw: string,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    void this.completeOAuth(raw, readQuery(request), request, response);
  }

  /**
   * Some providers (and corporate proxies) will POST `response_mode=form_post`.
   *
   * We ask for `query` everywhere, but accepting POST too means a misconfigured
   * provider degrades to a working flow instead of a 405.
   */
  @Post("oauth/:provider/callback")
  oauthCallbackPost(
    @Param("provider") raw: string,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    /* `form_post` puts the parameters in the body, not the query string. Merged
       into one shape so `completeOAuth` reads the same fields either way; query
       wins on a collision so a crafted query cannot shadow the body. */
    void this.completeOAuth(raw, { ...readFormBody(request), ...readQuery(request) }, request, response);
  }

  private async completeOAuth(
    raw: string,
    query: Record<string, string | undefined>,
    request: Request,
    response: Response,
  ): Promise<void> {
    const provider = this.requireProvider(raw);

    const resolved = await resolveOAuthCallback({
      provider,
      query,
      stateCookie: request.cookies?.[OAUTH_STATE_COOKIE],
      redirectUri: callbackUrl(toRequestLike(request), provider),
    });

    if (!resolved.ok) {
      failOAuth(response, resolved.code, resolved.message, resolved.provider);
      return;
    }

    completeSignIn(response, {
      userId: resolved.user._id,
      tokenVersion: resolved.user.tokenVersion,
      returnTo: resolved.returnTo,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                 */
  /* ---------------------------------------------------------------------- */

  private requireProvider(raw: string): ProviderKey {
    if (!isProviderKey(raw)) {
      throw notFound("unknown_provider", "Unknown provider.");
    }
    return raw;
  }
}
