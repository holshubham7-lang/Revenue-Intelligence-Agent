import { Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import {
  ApiError,
  badRequest,
  conflict,
  internal,
  unprocessable,
} from "../common/api-error";
import { assertCsrf, readJson, setCookie } from "../common/http";
import { getDb } from "../db";
import { hashPassword, verifyPassword } from "./password.ts";
import { mintSessionToken, sessionCookieOptions, SESSION_COOKIE } from "./session.ts";
import { CurrentUser } from "./session.interceptor.ts";
import { validatePasswordChange, validateProfileUpdate } from "./validation.ts";
import type { UserDoc } from "./user.ts";

/**
 * Account settings for the signed-in user — the person, not the company.
 *
 * Mirrors `frontend/app/api/account/{profile,password}/route.ts`. With
 * `API_REWRITE_ENABLED` on, Next forwards every `/api/*` path here, so these two
 * handlers are the ones that actually serve the account page in that mode. The
 * paths, status codes, and `{ error: { code, message, fields } }` envelope are
 * kept byte-identical to the route handlers so the client cannot tell which
 * implementation answered.
 */
@Controller("account")
export class AccountController {
  /**
   * Renames the signed-in user.
   *
   * Only the name is writable. The email is the account's identity — the sign-in
   * lookup key, the unique index, and the address every provider identity was
   * linked against — so changing it needs a verification flow this service has no
   * mailer for. `profileImage` is likewise provider-owned.
   *
   * Request:  { name }
   * Success:  200 { user: { id, name, email } }
   * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf · 422 validation
   *           · 500
   */
  @Post("profile")
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Req() request: Request, @CurrentUser() user: UserDoc) {
    assertCsrf(request);

    const result = validateProfileUpdate(await readJson(request));
    if (!result.ok) {
      throw unprocessable("validation_failed", "Please fix the highlighted fields.", result.fields);
    }

    const { name } = result.data;
    /* Nothing to write. Answering 200 with the current user rather than a 422
       keeps the client's "save" idempotent — a double-click on Save must not look
       like a failure. */
    if (name === user.name) {
      return { user: { id: user._id, name: user.name, email: user.email } };
    }

    try {
      const db = await getDb();
      await db
        .collection<UserDoc>("users")
        .updateOne({ _id: user._id }, { $set: { name, updatedAt: new Date().toISOString() } });
    } catch (error: unknown) {
      console.error("account/profile: failed to update name", error instanceof Error ? error.message : error);
      throw internal("Couldn't save your name right now. Please try again in a moment.");
    }

    return { user: { id: user._id, name, email: user.email } };
  }

  /**
   * Changes the signed-in user's password.
   *
   * Three things happen, in this order, and the order matters:
   *
   *  1. The current password is verified. Without it this would be a password
   *     *setter* reachable from any live session, so a stolen cookie could lock
   *     the real owner out permanently.
   *  2. `tokenVersion` is incremented, which invalidates every session token ever
   *     issued for this account — the same revocation sign-out uses. A password
   *     change that left other sessions alive would defeat the point of making it.
   *  3. A fresh session cookie is minted at the new version and returned, so the
   *     browser making the request stays signed in.
   *
   * Request:  { currentPassword, newPassword, confirmPassword }
   * Success:  200 { ok: true } + Set-Cookie: revops_session (new version)
   * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf · 422 validation
   *           · 400 wrong_current / no_password · 409 concurrent change · 500
   */
  @Post("password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: UserDoc,
  ) {
    assertCsrf(request);

    const result = validatePasswordChange(await readJson(request));
    if (!result.ok) {
      throw unprocessable("validation_failed", "Please fix the highlighted fields.", result.fields);
    }

    const { currentPassword, newPassword } = result.data;

    /* A social-only account has no password to verify and no hash to replace.
       Refusing is the only safe answer: silently succeeding would claim to have
       set a password on an account whose sign-in still goes through the provider. */
    if (user.authProvider !== "password" || !user.passwordHash) {
      throw badRequest(
        "no_password",
        "This account signs in with a work account, so it has no password to change.",
      );
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "wrong_current", "That isn't your current password.", {
        currentPassword: "That isn't your current password.",
      });
    }

    const nextVersion = user.tokenVersion + 1;

    try {
      const db = await getDb();
      const updated = await db.collection<UserDoc>("users").updateOne(
        { _id: user._id, tokenVersion: user.tokenVersion },
        {
          $set: {
            passwordHash: hashPassword(newPassword),
            updatedAt: new Date().toISOString(),
          },
          $inc: { tokenVersion: 1 },
        },
      );
      /* The `tokenVersion` in the filter is the optimistic lock: two concurrent
         changes can only both match the version they read, so the second one finds
         no document and cannot silently skip the other's revocation. */
      if (updated.matchedCount === 0) {
        throw conflict(
          "concurrent_change",
          "Your password was just changed somewhere else. Please sign in again.",
        );
      }
    } catch (error: unknown) {
      /* The 409 above is a deliberate answer, not a fault — rethrow it rather
         than reporting a database problem the user can do nothing about. */
      if (error instanceof ApiError) throw error;
      console.error("account/password: failed to update password", error instanceof Error ? error.message : error);
      throw internal("Couldn't update your password right now. Please try again in a moment.");
    }

    /* Keeps this browser signed in at the new version. Every other session is now
       stale and will fail its next `resolveSessionUser` check. */
    setCookie(
      response,
      SESSION_COOKIE,
      mintSessionToken(user._id, nextVersion),
      sessionCookieOptions(),
    );
    return { ok: true };
  }
}