import {
  Injectable,
  UnauthorizedException,
  createParamDecorator,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";

import { SESSION_COOKIE } from "./session";
import { resolveSessionUser, type UserDoc } from "./user";

/** The per-request session lookup stashed by `SessionInterceptor`. */
export type RequestWithUser = Request & {
  authUser?: Promise<UserDoc | null> | null;
};

/** The 401 every protected route answers with, in the shared envelope. */
export const UNAUTHORIZED = () =>
  new UnauthorizedException({
    code: "unauthenticated",
    message: "Your session has expired. Sign in again to continue.",
  });

/**
 * Resolves the session cookie to a live user, at most once per request.
 *
 * This is the same gate the Next.js route handlers used, and the reason the
 * `/api/*` rewrite needs no trust boundary between the two processes: the API
 * verifies the cookie signature *and* re-reads the user from Mongo, so a blocked
 * account or a bumped `tokenVersion` (sign-out, password change) invalidates an
 * otherwise perfectly-signed cookie.
 *
 * Registered globally and deliberately non-throwing. Public routes — the OAuth
 * start/callback, `GET /api/auth/csrf`, forgot-password — must work with no
 * cookie, so enforcement lives in the `@CurrentUser` decorator instead.
 */
@Injectable()
export class SessionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.[SESSION_COOKIE];
    /* Not awaited: the lookup runs concurrently with the handler, and
       `@CurrentUser` awaits it. Serialising every request behind a Mongo read
       would double the latency of routes that also do their own queries. */
    request.authUser = token ? this.lookup(token) : null;
    return next.handle();
  }

  private async lookup(token: string): Promise<UserDoc | null> {
    try {
      return await resolveSessionUser(token);
    } catch {
      /* A database fault must not authenticate anyone. Returning null makes
         `@CurrentUser` 401, which is the correct outcome for a session we
         cannot verify — never a silent pass-through. */
      return null;
    }
  }
}

async function sessionUser(request: RequestWithUser): Promise<UserDoc | null> {
  const pending = request.authUser;
  return pending === null || pending === undefined ? null : await pending;
}

/**
 * The signed-in `UserDoc`, or 401.
 *
 * `data` overrides the 401 message. The routes that predate the shared helper
 * used two different wordings — "Your session has expired. Sign in again to
 * continue." on most, and the shorter "Your session has expired." on the
 * data-source list and the skip/plan endpoints — and those strings are in the
 * client bundle, so they are preserved rather than normalised.
 */
export const CurrentUser = createParamDecorator(
  async (message: string | undefined, context: ExecutionContext): Promise<UserDoc> => {
    const user = await sessionUser(context.switchToHttp().getRequest<RequestWithUser>());
    if (!user) {
      throw message
        ? new UnauthorizedException({ code: "unauthenticated", message })
        : UNAUTHORIZED();
    }
    return user;
  },
);

/** The signed-in `UserDoc`, or null. For routes that also serve anonymous callers. */
export const OptionalUser = createParamDecorator(
  async (_data: unknown, context: ExecutionContext): Promise<UserDoc | null> =>
    sessionUser(context.switchToHttp().getRequest<RequestWithUser>()),
);
