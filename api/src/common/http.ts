import type { Request, Response } from "express";

import { csrfFailed, forbidden, invalidJson } from "./api-error";
import type { RequestLike } from "../auth/oauth";
import { CSRF_COOKIE, CSRF_HEADER, csrfPasses } from "../auth/csrf";

/**
 * Adapters between Express/Nest requests and the framework-agnostic helpers the
 * ported modules were written against.
 *
 * The ported logic deliberately takes primitives (a cookie value, a header
 * value) rather than a request object, so these adapters are the only place that
 * knows this service runs on Express.
 */

/**
 * The `Host` authority the browser addressed, including the port.
 *
 * Express's `req.hostname` drops the port, which would build
 * `http://localhost/api/auth/oauth/...` and lose the `:3000` that every
 * registered callback URL carries. `Host` also cannot be a forged path: it is
 * normalised by the HTTP server, and `oauth.ts` re-validates the value before
 * trusting it.
 */
export function toRequestLike(request: Request): RequestLike {
  return {
    header: (name: string) => {
      const value = request.headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    host: request.get("host") ?? request.hostname,
    protocol: request.protocol,
  };
}

/**
 * Parses a JSON body, converting a parse failure into the `invalid_json` 400.
 *
 * Nest's `ValidationPipe` handles *validated* bodies; this covers the malformed
 * ones, where the payload never becomes an object to validate.
 */
export async function readJson<T = unknown>(request: Request): Promise<T> {
  const raw = (request as Request & { body?: unknown }).body;
  if (raw === undefined || raw === null || raw === "") throw invalidJson();
  if (typeof raw !== "object") throw invalidJson();
  return raw as T;
}

/**
 * Enforces the double-submit CSRF check. Throws the 403 on mismatch.
 *
 * Reads the cookie off `request.cookies`, populated by `cookie-parser` in
 * `main.ts`. A missing cookie and a missing header are both a failure — an empty
 * token must never pass, or CSRF becomes opt-in.
 *
 * `message` overrides the 403 text. The routes carried two wordings ("...Refresh
 * the page and try again." on most, a bare "Session token missing or invalid." on
 * the skip/plan/list endpoints) and those strings reach the client, so they are
 * preserved rather than normalised.
 */
export function assertCsrf(request: Request, message?: string): void {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies ?? {};
  const cookie = cookies[CSRF_COOKIE];
  const headerValue = request.headers[CSRF_HEADER];
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!csrfPasses(cookie, header ?? null)) {
    throw message
      ? forbidden("csrf_failed", message)
      : csrfFailed();
  }
}

/**
 * Reads query parameters as plain strings, mirroring `URLSearchParams.get()`.
 *
 * This is a security-relevant difference from the Next.js version of these
 * routes, not a typing convenience. `URLSearchParams.get("state")` on
 * `?state[a]=forged` looks for the literal key `state[a]` and returns null.
 * Express parses that same URL into `req.query.state = { a: "forged" }`, so
 * passing `req.query` straight through would hand an *object* to
 * `verifyOAuthTransaction`. A non-string state must be treated as absent — never
 * coerced with `String(...)`, which would turn `{ a: 1 }` into `"[object Object]"`
 * and a comparison of the wrong shape into a mismatch the caller cannot debug.
 *
 * Only top-level string values are kept. Repeated keys take the first value,
 * matching `get()`. Nested objects and arrays are dropped entirely.
 */
export function readQuery(request: Request): Record<string, string | undefined> {
  return flattenParams(request.query);
}

/** The same normalisation for a `form_post` callback body. */
export function readFormBody(request: Request): Record<string, string | undefined> {
  const body = (request as Request & { body?: unknown }).body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return flattenParams(body as Record<string, unknown>);
}

function flattenParams(source: Record<string, unknown>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      /* A repeated parameter: `?code=a&code=b`. `get()` yields the first. */
      out[key] = value[0];
    }
    /* Anything else (nested object, number, missing) is intentionally absent. */
  }
  return out;
}

/**
 * Sets a cookie from the shared option shape used by `session.ts`/`csrf.ts`/
 * `oauth.ts`.
 *
 * These option objects are plain data (`sameSite`, `httpOnly`, `maxAge`) rather
 * than Express's `CookieOptions`, so the ported modules stay framework-free and
 * can be tested without a server. This maps them across.
 *
 * `maxAge` is multiplied by 1000, and that is not cosmetic. The ported option
 * objects express lifetimes in **seconds** (`SESSION_TTL_SECONDS` is 30 days in
 * seconds, the OAuth state cookie is `600`), while `res.cookie` interprets
 * `maxAge` as **milliseconds**. Passing the seconds through unchanged turns
 * `600` into 0.6s, which the `cookie` module floors to `Max-Age=0` — an
 * already-expired cookie. That is exactly what happened to the OAuth state
 * cookie: the browser dropped it before the provider round-tripped, so every
 * social sign-in came back `state_mismatch`. The 30-day session was silently
 * becoming 43 minutes.
 */
export function setCookie(
  response: Response,
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    sameSite: "strict" | "lax" | "none";
    secure: boolean;
    /** Seconds. Zero deletes the cookie. */
    maxAge: number;
    path: string;
    priority?: "high" | "medium" | "low";
  },
): void {
  response.cookie(name, value, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    maxAge: options.maxAge * 1000,
    path: options.path,
    ...(options.priority ? { priority: options.priority } : {}),
  });
}

/**
 * Expires a cookie so the browser drops it immediately.
 *
 * The attributes must match those the cookie was set with, or the browser treats
 * it as a different cookie and keeps the original. Emits `Max-Age=0` *and* an
 * epoch `Expires`, matching the Next.js `cookies.set(name, "", { maxAge: 0 })`
 * these routes used to send. Express's own `res.clearCookie` drops `Max-Age`
 * and relies on `Expires` alone, which works but leaves the deletion dependent
 * on clock comparison in the browser rather than explicit.
 */
export function clearCookie(
  response: Response,
  name: string,
  options: { path: string; secure: boolean; sameSite?: "strict" | "lax" | "none"; httpOnly?: boolean },
): void {
  response.cookie(name, "", {
    path: options.path,
    secure: options.secure,
    httpOnly: options.httpOnly ?? true,
    sameSite: options.sameSite ?? "strict",
    maxAge: 0,
    expires: new Date(0),
  });
}
