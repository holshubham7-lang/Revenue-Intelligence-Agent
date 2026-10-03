import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * CSRF protection (double-submit cookie pattern) for the auth API.
 *
 * A random token is issued by `GET /api/auth/csrf` in a cookie that the browser
 * JS can read (httpOnly=false). The client echoes it back via the
 * `X-CSRF-Token` header on state-changing requests, and the server rejects the
 * request unless the echoed value matches the cookie. `SameSite=Strict` and the
 * header/cookie match cover the cross-site forgery vectors without needing a
 * server-side session store.
 *
 * Deliberately framework-agnostic: it takes only the two things it needs (the
 * cookie value and the header value) rather than a `NextRequest`. That was the
 * single Next.js-specific import in this module when it lived in the frontend's
 * route handlers; Nest serves these routes now, so the dependency is inverted.
 */

export const CSRF_COOKIE = "revops_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/** Cookie options — readable by JS so the form can echo it, sticky for an hour. */
export function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
    path: "/",
  };
}

/**
 * True when the `X-CSRF-Token` header equals the `revops_csrf` cookie.
 * Compared through a hash so timingSafeEqual sees equal-length buffers.
 */
export function csrfPasses(cookieValue: string | undefined, headerValue: string | null): boolean {
  if (!cookieValue || !headerValue) return false;
  const a = createHash("sha256").update(cookieValue).digest();
  const b = createHash("sha256").update(headerValue).digest();
  return timingSafeEqual(a, b);
}
