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
import { assertCsrf, clearCookie, readFormBody, readJson, readQuery, setCookie, toRequestLike } from "../common/http";
import { loadConfig } from "../common/config";
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
import { signInWithOAuth } from "./identity.ts";
import {
  authorizeUrl,
  beginOAuthTransaction,
  callbackUrl,
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
} from "./oauth.ts";
import { OptionalUser } from "./session.interceptor.ts";

/**
 * Cookie names and options for the short-lived OAuth artefacts.
 *
 * Centralised here because the start route and the callback route must write the
 * error cookie identically — a mismatch would let a message set by one be read
 * back with the other's attributes.
 */

/**
 * The message the callback leaves for `/signin`.
 *
 * httpOnly, so the sign-in page must be a server component that reads it and
 * clears it in the same response. A redirect carrying `?error=<text>` instead
 * would leak the text into the address bar, browser history, and the next
 * page's `Referer`.
 */
const OAUTH_ERROR_COOKIE = "revops_oauth_error";

const errorCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
});

/**
 * The OAuth state cookie is single-use and short-lived.
 *
 * `SameSite=Lax` rather than Strict on purpose: a Strict cookie is withheld on
 * the cross-site top-level navigation back from the provider, which would break
 * every sign-in.
 */
const stateCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
});

/**
 * Redirects back to the browser-facing origin.
 *
 * Built from `APP_BASE_URL`, never from this request's `Host`. The API sits
 * behind the Next.js rewrite on `:3010`, so `request.url` would send the user to
 * the API's own origin — a 404 on a page that looks like the app.
 */
function redirectToBrowser(response: Response, path: string): void {
  response.redirect(HttpStatus.FOUND, new URL(path, loadConfig().appBaseUrl).toString());
}

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
      this.bounceToSignIn(response, "not_configured",
        `${providerConfig(provider).label} sign-in isn't configured on this deployment.`);
      return;
    }

    try {
      const transaction = beginOAuthTransaction(provider, returnTo);
      const redirect = authorizeUrl(
        providerConfig(provider),
        callbackUrl(toRequestLike(request), provider),
        transaction,
      );

      setCookie(response, OAUTH_STATE_COOKIE, transaction.cookie, stateCookieOptions(600));
      response.redirect(HttpStatus.FOUND, redirect);
    } catch (error: unknown) {
      console.error(`oauth/${provider}: could not start`, error instanceof Error ? error.message : error);
      this.bounceToSignIn(response, "internal_error", "Sign-in is unavailable right now. Please try again.");
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
    const config = providerConfig(provider);

    if (!providerConfigured(provider)) {
      this.failOAuth(response, "not_configured", `${config.label} sign-in is not configured on this deployment.`);
      return;
    }

    /* The user pressed "Cancel", or the provider refused. */
    const providerError = query.error;
    if (providerError) {
      const denied = providerError === "access_denied";
      this.failOAuth(
        response,
        denied ? "access_denied" : "provider_error",
        denied
          ? `${config.label} did not grant access. If other accounts can sign in fine, this is usually an app-configuration issue rather than anything you did.`
          : `${config.label} returned an error (${providerError}).`,
        provider,
      );
      return;
    }

    /* State first: nothing below it is trustworthy until this passes. */
    const transaction = verifyOAuthTransaction(request.cookies?.[OAUTH_STATE_COOKIE], query.state);
    if (!transaction) {
      this.failOAuth(
        response,
        "state_mismatch",
        "That sign-in attempt expired or didn't start from this browser. Please try again.",
      );
      return;
    }

    /* The callback path must match the one the flow started with. */
    if (transaction.provider !== provider) {
      this.failOAuth(
        response,
        "state_mismatch",
        "That sign-in link was started for a different provider. Please try again.",
      );
      return;
    }

    const code = query.code;
    if (!code) {
      this.failOAuth(response, "missing_code", `${config.label} didn't return a sign-in code.`);
      return;
    }

    try {
      const accessToken = await exchangeCode({
        provider: config,
        code,
        redirectUri: callbackUrl(toRequestLike(request), provider),
        codeVerifier: transaction.codeVerifier,
      });

      const profile = await fetchProfile(config, accessToken);
      const outcome = await signInWithOAuth(provider, profile);

      if (!outcome.ok) {
        this.failOAuth(response, outcome.code, outcome.message, provider);
        return;
      }

      /* Same session mechanism as password sign-in — one revocation path. */
      setCookie(
        response,
        SESSION_COOKIE,
        mintSessionToken(outcome.user._id, outcome.user.tokenVersion),
        sessionCookieOptions(),
      );
      /* Single-use: cleared so a replayed callback URL is inert. */
      clearCookie(response, OAUTH_STATE_COOKIE, stateCookieOptions(0));
      /* Cleared so the sign-in page cannot show a stale message beside a
         freshly established session. */
      clearCookie(response, OAUTH_ERROR_COOKIE, errorCookieOptions(0));

      /* `returnTo` passed `safeReturnTo`, so this is an allowlisted internal
         path — never an open redirect. */
      redirectToBrowser(response, transaction.returnTo);
    } catch (error: unknown) {
      const providerSide = error instanceof OAuthExchangeError;
      console.error(`oauth/${provider}/callback: ${error instanceof Error ? error.message : String(error)}`);
      this.failOAuth(
        response,
        providerSide ? "provider_error" : "internal_error",
        providerSide
          ? `${config.label} couldn't complete the sign-in. If this happens for some accounts but not others, it's an app-configuration issue rather than anything you did.`
          : "Couldn't complete sign-in. Please try again in a moment.",
        providerSide ? provider : undefined,
      );
    }
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

  /** Back to the form with a reason, from the OAuth *start* route. */
  private bounceToSignIn(response: Response, code: string, message: string): void {
    const url = new URL("/signin", loadConfig().appBaseUrl);
    url.searchParams.set("error", code);
    setCookie(response, OAUTH_ERROR_COOKIE, message.slice(0, 400), errorCookieOptions(600));
    response.redirect(HttpStatus.FOUND, url.toString());
  }

  /** Back to the form from the callback, also explaining provider-console causes. */
  private failOAuth(
    response: Response,
    code: string,
    message: string,
    provider?: ProviderKey,
  ): void {
    const url = new URL("/signin", loadConfig().appBaseUrl);
    url.searchParams.set("error", code);
    if (provider) {
      url.searchParams.set("provider", provider);
      /* Explains provider-console causes, which are the majority of "works for
         some accounts" reports and are invisible from the error alone. */
      url.searchParams.set("hint", publishStatusHint(provider));
    }
    clearCookie(response, OAUTH_STATE_COOKIE, stateCookieOptions(0));
    setCookie(response, OAUTH_ERROR_COOKIE, message.slice(0, 400), errorCookieOptions(600));
    response.redirect(HttpStatus.FOUND, url.toString());
  }
}
