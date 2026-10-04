import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless session cookies for the auth API.
 *
 * A signed token (`payload.signature`, both base64url) is stored in an httpOnly
 * cookie. The payload is a small JSON object —
 * `{ sub: userId, ver: tokenVersion, iat, exp }` — and the signature is an
 * HMAC-SHA256 over the payload keyed with `AUTH_SECRET`, so the cookie can't be
 * forged or tampered with without the secret.
 *
 * No server-side session store, but the `ver` claim provides real revocation:
 * it is bound to `users.tokenVersion`, so bumping that value (sign-out,
 * password change, security event) invalidates every earlier token
 * cryptographically even if the cookie was stolen.
 */

/** `__Host-` requires Secure + Path=/ + no Domain, which production satisfies. */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-revops_session" : "revops_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_MAX_BYTES = 4096; // bound on token size — a cookie can't legitimately exceed this
const MIN_SECRET_BYTES = 32;
const IAT_SKEW_SECONDS = 60; // allow small clock skew when checking `iat`

export type SessionClaims = {
  sub: string;
  ver: number;
  iat: number;
  exp: number;
};

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set. Add it to .env.");
  }
  if (value.length < MIN_SECRET_BYTES) {
    throw new Error(
      `AUTH_SECRET must be at least ${MIN_SECRET_BYTES} characters. Current value is too weak.`,
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Builds an HMAC-signed session token bound to the user's current
 * `tokenVersion`, so a `tokenVersion` bump revokes this session.
 */
export function mintSessionToken(userId: string, tokenVersion: number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: userId,
    ver: tokenVersion,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifies a token's signature, claims, and expiry, returning its claims or
 * null. Safe against wrong-length guesses via a hashed timing-safe comparison.
 * Rejects tokens whose claims are malformed or out of range (oversized,
 * non-numeric timestamps, future `iat`, `sub`/`ver` out of shape).
 */
export function verifySessionToken(token: string): SessionClaims | null {
  if (typeof token !== "string" || token.length === 0 || token.length > SESSION_MAX_BYTES) {
    return null;
  }

  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (payload.length === 0 || signature.length === 0) return null;

  const expected = sign(payload);
  const a = createHmac("sha256", expected).digest();
  const b = createHmac("sha256", signature).digest();
  if (!timingSafeEqual(a, b)) return null;

  let claims: Partial<SessionClaims>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 128) {
    return null;
  }
  if (typeof claims.ver !== "number" || !Number.isInteger(claims.ver) || claims.ver < 0) {
    return null;
  }
  if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat)) {
    return null;
  }
  if (claims.iat > nowSeconds + IAT_SKEW_SECONDS) {
    // A token minted in the future is rejected outright — never replay ours.
    return null;
  }
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return null;
  }
  if (claims.exp < nowSeconds) {
    return null;
  }

  return {
    sub: claims.sub,
    ver: claims.ver,
    iat: claims.iat,
    exp: claims.exp,
  };
}

/**
 * Cookie settings for the session — httpOnly, sticky for 30 days.
 *
 * `SameSite=Lax`, not `Strict`, and the reason is the OAuth callback.
 *
 * `SameSite` decides both when the browser *stores* a cookie and which requests
 * *carry* it, so there is no attribute that permits the one cross-site navigation
 * a social sign-in requires while withholding the cookie from everything else.
 * Under `Strict` the cookie is set on the callback response but never presented
 * on the callback *request* — the redirect from `accounts.google.com` is
 * cross-site, so the browser strips it. The callback then resolves no session,
 * sets a new cookie, and the user lands back on sign-in having "logged in"
 * successfully. `Strict` cannot be narrowed to the callback, only relaxed.
 *
 * `Lax` sends the cookie on top-level GET navigations, which includes the
 * provider round-trip, and still withholds it on every cross-site subresource,
 * XHR and form post. That is the shape that matters here: every mutating route
 * is a POST guarded by its own double-submit CSRF token (`revops_csrf`, compared
 * against the `x-csrf-token` header), so losing the session cookie on a
 * cross-site POST costs an attacker nothing they could not already get past.
 *
 * The residual exposure `Strict` would have closed is a cross-site top-level GET
 * that mutates state. No such route exists — every write is a POST — and a GET
 * can only read data the cookie holder could request directly anyway.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    priority: "high" as const,
  };
}