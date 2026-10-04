import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { safeReturnTo } from "./oauth.ts";

/**
 * Cross-origin handoff for social sign-in.
 *
 * ## The problem this solves
 *
 * A provider matches `redirect_uri` against the strings registered in its
 * console, character for character, and rejects anything else *before* the user
 * sees a consent screen. When an app is registered for
 * `https://api.example.com/auth/social/google/callback` but the product now
 * lives at `https://app.example.com`, the flow cannot start at all — no matter
 * how correct the code is.
 *
 * The session cookie has to be minted on the *browser-facing* origin, because
 * that is the origin whose pages read it. So the two constraints pull in
 * opposite directions: the callback must land on the API origin (to satisfy the
 * console), and the session must appear on the frontend origin (to be usable).
 *
 * ## The handoff
 *
 * The callback completes on the API origin, signs the user in there exactly as
 * it always would, and then hands the browser to
 * `{APP_BASE_URL}/api/auth/oauth/relay?token=…` with a **one-time, 60-second,
 * signed** token that is not a session token. That request arrives on the
 * frontend origin, so the session cookie the relay endpoint sets is bound to the
 * right host.
 *
 * ## Why a second token instead of just setting the session cookie
 *
 * A `Set-Cookie` on the API-origin response would be stored for the API host, and
 * the frontend would never send it. And putting the *session* token in a URL
 * would leave long-lived credentials in browser history, in the API's access
 * logs, and in anything that reads either. So what travels in the URL is a
 * value that is useless on its own: it names a user for sixty seconds, is bound
 * to one destination, and can only be spent once.
 *
 * ## Residual risk, stated plainly
 *
 * The token appears in a URL for the duration of one redirect. Anyone who
 * observed it within the TTL and before it was spent could sign in as that user.
 * That is the same exposure window every OAuth callback already accepts for its
 * `code`, and the mitigations are the same ones: short TTL, single use, and a
 * signature over the payload so a crafted value cannot be forged. The spent-token
 * list is per-process, so on a multi-instance deployment single-use degrades to
 * "single-use per instance" — authentication is still required for every token,
 * only the replay defence weakens. Use a shared store if this app ever scales out.
 */

/** Provider keys, kept as a literal union so this file needs no other import. */
type RelayProvider = "google" | "microsoft" | "linkedin";

/** Deliberately short: the token exists only to survive one redirect. */
const RELAY_TTL_SECONDS = 60;
const MAX_TOKEN_BYTES = 2048;

export type RelayClaims = {
  /** Domain separator — stops this signature being read as a session or state one. */
  k: "oauth_relay";
  sub: string;
  ver: number;
  /** Where to send the browser once the session cookie is set. */
  r: string;
  /** Single-use id, remembered after the first spend. */
  jti: string;
  iat: number;
  exp: number;
};

function relaySecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters to use social sign-in.");
  }
  return value;
}

function signRelay(payload: string): string {
  return createHmac("sha256", relaySecret())
    .update("sha256:oauth-relay")
    .update(payload)
    .digest("base64url");
}

/**
 * The API's own public origin — the one the provider console knows about.
 *
 * It cannot be derived from the request: the API sits behind the Next.js rewrite,
 * so `Host` here is the frontend origin, which is precisely the value that is not
 * registered. So it is configured, and it is validated as an origin (no path, no
 * query, no fragment) because it is spliced into `redirect_uri`, where a smuggled
 * `/..` or `?x=` would break the exact match the provider performs.
 */
export function relayOrigin(): string | null {
  const raw = process.env.AUTH_RELAY_URL?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return `${url.protocol}//${url.host}`;
}

/** True when the deployment should use the relay instead of a same-origin callback. */
export function relayEnabled(): boolean {
  return relayOrigin() !== null;
}

export function relayStartUrl(provider: RelayProvider): string {
  const origin = relayOrigin();
  if (!origin) throw new Error("AUTH_RELAY_URL is not set.");
  return `${origin}/auth/social/${provider}`;
}

/**
 * The value sent as `redirect_uri`, and re-sent unchanged at token exchange.
 *
 * Both sides call this one function, which is what keeps the provider from
 * seeing the authorize/exchange mismatch that invalidates the code.
 */
export function relayCallbackUrl(provider: RelayProvider): string {
  return `${relayStartUrl(provider)}/callback`;
}

/**
 * Spent-token ids, kept only for as long as their tokens could still be valid.
 *
 * Cleared wholesale on each insert once it grows, rather than per-entry timers:
 * the window is a minute, so a bounded set is enough and it cannot leak.
 */
const spent = new Set<string>();
const spentUntil = new Map<string, number>();

function rememberSpent(jti: string, expiresAt: number): void {
  spent.add(jti);
  spentUntil.set(jti, expiresAt);
  if (spentUntil.size > 4096) {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, until] of spentUntil) {
      if (until <= now) {
        spentUntil.delete(id);
        spent.delete(id);
      }
    }
  }
}

export function createRelayToken(input: {
  userId: string;
  tokenVersion: number;
  returnTo: string;
}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims: RelayClaims = {
    k: "oauth_relay",
    sub: input.userId,
    ver: input.tokenVersion,
    r: input.returnTo,
    jti: randomBytes(16).toString("base64url"),
    iat: nowSeconds,
    exp: nowSeconds + RELAY_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signRelay(payload)}`;
}

export type SpentRelayToken = {
  userId: string;
  tokenVersion: number;
  returnTo: string;
};

/**
 * Verifies, and *consumes*.
 *
 * Returns null for a forged, expired, malformed or already-spent token, and
 * never distinguishes them — an attacker probing for one of those states gains
 * nothing, and a legitimate user gets the same "try again" either way.
 *
 * The spend happens here, before the caller mints a session: two parallel
 * requests carrying the same token both run this function, and only the first
 * finds the id absent.
 */
export function consumeRelayToken(token: unknown): SpentRelayToken | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_BYTES) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = signRelay(payload);
  /* Hash both sides so timingSafeEqual always sees equal-length buffers. */
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(signature).digest();
  if (!timingSafeEqual(a, b)) return null;

  let claims: Partial<RelayClaims>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (claims.k !== "oauth_relay") return null;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
  if (typeof claims.ver !== "number" || !Number.isInteger(claims.ver)) return null;
  if (typeof claims.r !== "string") return null;
  if (typeof claims.jti !== "string") return null;
  if (typeof claims.exp !== "number") return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (claims.exp <= nowSeconds) return null;
  if (spent.has(claims.jti)) return null;

  rememberSpent(claims.jti, claims.exp);

  /* Re-validated rather than trusted: the signature covers what was signed, but a
     caller that ever mints a token with an unchecked destination must not be able
     to turn this into an open redirect. */
  return {
    userId: claims.sub,
    tokenVersion: claims.ver,
    returnTo: safeReturnTo(claims.r),
  };
}
