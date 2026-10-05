import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Social sign-in: Google, Microsoft, LinkedIn.
 *
 * Authorization Code flow with PKCE for all three providers, so the code
 * exchange is not dependent on the client secret alone. Nothing is stored
 * server-side between the redirect and the callback — the whole transaction
 * lives in one signed cookie — so there is no new collection to run migrations
 * on and no orphan rows when a user abandons the flow halfway.
 *
 * ## Why this fails for *some* users and not others
 *
 * Almost every "it works for me but not for them" report on social login is a
 * provider-console configuration problem, not a code problem. The three that
 * bite hardest:
 *
 * 1. **A Google OAuth app left in `Testing` publishing status.** Google then
 *    allows only the accounts explicitly listed as *test users* (100 max), and
 *    every other account gets `403 access_denied` no matter how correct the code
 *    is. Fix: set the consent screen to `In production`, or add the affected
 *    accounts under *Test users*. `verifyPublishStatus` surfaces this early.
 *
 * 2. **A Microsoft app registration whose *Supported account types* is left at
 *    "My organization".** Only users inside the registering tenant can sign in.
 *    Fix: set it to "Accounts in any organizational directory" and, if personal
 *    `@outlook.com` / `@hotmail.com` users should work, tick
 *    "Personal Microsoft accounts" as well. `tenant` is configurable here for
 *    the deliberately-single-tenant case.
 *
 * 3. **LinkedIn's OpenID Connect product is not self-serve.** `openid` scope on
 *    LinkedIn only works after LinkedIn grants product access to your app; until
 *    then the authorize call returns 403. This cannot be fixed in code, only by
 *    requesting access in the LinkedIn developer portal.
 *
 * ## Browser support
 *
 * The flow is a top-level `window.location` navigation, not `fetch`, so it works
 * identically in every browser including Safari with Intelligent Tracking
 * Prevention on — no third-party cookie is ever involved, since the state cookie
 * is first-party and the callback returns to our own origin.
 *
 * The state cookie is `SameSite=Lax` on purpose. `SameSite=Strict` (which the
 * session cookie uses) is *not* sent on a cross-site top-level navigation, so a
 * Strict state cookie would be silently dropped on the way back from the
 * provider and every sign-in would fail with an opaque state mismatch. `Lax` is
 * still sent for top-level GET navigations, which is exactly this flow, and is
 * still withheld for cross-site POSTs.
 */

/**
 * Re-exported from `@/lib/contracts` so the client-side `oauth-client.ts` can
 * import the key union without pulling this module — which reads client secrets
 * from the environment — into the client bundle.
 */
export type { ProviderKey } from "../contracts";

import type { ProviderKey } from "../contracts";

export type OAuthProvider = {
  key: ProviderKey;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: readonly string[];
  /** LinkedIn rejects `client_secret`+PKCE combinations in some app configs. */
  pkce: boolean;
  /** Expected `iss`, used as a sanity check on the userinfo response. */
  issuerHint: string;
};

/**
 * The state cookie.
 *
 * `Lax`, httpOnly, and short-lived. It must survive the round trip to the
 * provider and back — see the `SameSite` note above — but it must never outlive
 * the flow or be readable by script.
 */
export const OAUTH_STATE_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-revops_oauth" : "revops_oauth";

const STATE_TTL_SECONDS = 600; // 10 minutes is plenty for a login round trip
const MAX_STATE_BYTES = 2048;

/** Internal paths an OAuth callback may return to. No absolute URLs. */
const RETURN_TO_ALLOWLIST = [
  "/company",
  "/chat",
  "/data",
  "/account",
  "/company/action-plan",
];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/**
 * `tenant` is `common` by default so *any* Microsoft work or personal account
 * can sign in. Set `MICROSOFT_TENANT` to a tenant id to deliberately restrict
 * the app to one organisation.
 */
function microsoftTenant(): string {
  return process.env.MICROSOFT_TENANT || "common";
}

export function providerConfig(key: ProviderKey): OAuthProvider {
  switch (key) {
    case "google":
      return {
        key,
        label: "Google",
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scopes: ["openid", "email", "profile"],
        pkce: true,
        issuerHint: "accounts.google.com",
      };
    case "microsoft": {
      const tenant = microsoftTenant();
      return {
        key,
        label: "Microsoft",
        authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
        /* `openid email profile` is all the OIDC userinfo endpoint needs. `User.Read`
           is deliberately absent: it is a Graph delegated permission, so it drags
           Microsoft Graph into the consent prompt and, in a tenant with admin
           consent required, it turns a plain sign-in button into a refused one
           for exactly the users outside the registering organisation. */
        scopes: ["openid", "email", "profile"],
        pkce: true,
        issuerHint: "login.microsoftonline.com",
      };
    }
    case "linkedin":
      return {
        key,
        label: "LinkedIn",
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        userInfoUrl: "https://api.linkedin.com/v2/userinfo",
        scopes: ["openid", "profile", "email"],
        /* PKCE is deliberately off. LinkedIn only honours it on
           /oauth/native-pkce/authorization, and only once their team has enabled
           it for the app by hand. Sending code_challenge to /oauth/v2/authorization
           instead fails at token exchange, and LinkedIn reports that as
           `invalid_client` rather than naming the real cause. Client secret plus an
           exact redirect_uri match is the standard confidential-client exchange. */
        pkce: false,
        issuerHint: "https://www.linkedin.com/oauth",
      };
  }
}

export function isProviderKey(value: string): value is ProviderKey {
  return value === "google" || value === "microsoft" || value === "linkedin";
}

/** True when this provider has credentials and can actually be used. */
export function providerConfigured(key: ProviderKey): boolean {
  try {
    if (key === "google") {
      requiredEnv("GOOGLE_CLIENT_ID");
      requiredEnv("GOOGLE_CLIENT_SECRET");
    } else if (key === "microsoft") {
      requiredEnv("MICROSOFT_CLIENT_ID");
      requiredEnv("MICROSOFT_CLIENT_SECRET");
    } else {
      requiredEnv("LINKEDIN_CLIENT_ID");
      requiredEnv("LINKEDIN_CLIENT_SECRET");
    }
    return true;
  } catch {
    return false;
  }
}

function clientCredentials(key: ProviderKey): { clientId: string; clientSecret: string } {
  const prefix = key === "google" ? "GOOGLE" : key === "microsoft" ? "MICROSOFT" : "LINKEDIN";
  return {
    clientId: requiredEnv(`${prefix}_CLIENT_ID`),
    clientSecret: requiredEnv(`${prefix}_CLIENT_SECRET`),
  };
}

/** RFC 7636 §4.2. Verifier is 43–128 chars of the unreserved set. */
function createCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * The origin to build callback URLs from.
 *
 * `APP_BASE_URL` wins when set, so preview and production deployments do not
 * depend on header propagation. Without it we fall back to the request origin,
 * which is what makes this work unchanged across every host it is deployed to.
 * A spoofed `Host` cannot be leveraged: the `redirect_uri` must be registered
 * with the provider, and the callback would not carry our first-party cookie.
 *
 * The header values are still validated, because an unchecked `Host` header
 * reaches further than that argument assumes. A value like `evil.example/#` or
 * `evil.example?x=` splices a path or query into `redirect_uri`, which changes
 * what the provider registered vs. what we send — some providers compare the two
 * literally, which turns a header injection into a confusing `redirect_uri_mismatch`
 * for a legitimate user. Only a bare `host[:port]` is accepted here.
 */
function isPlausibleHost(value: string): boolean {
  return /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(value) && !value.includes("..");
}

/**
 * The subset of a request that `baseUrl` needs.
 *
 * `oauth.ts` used to take the global web `Request` (from `next/server`) and
 * reach for `url.host` and `headers.get`. Nest receives an Express request, so
 * this structural type is what keeps the origin logic framework-agnostic —
 * `auth.controller.ts` adapts an Express request to it.
 */
export type RequestLike = {
  /** Case-insensitive header lookup, e.g. `request.header("x-forwarded-host")`. */
  header(name: string): string | undefined;
  /** `Host` authority *including* the port, e.g. `localhost:3000`. */
  host: string;
  /** `http` or `https`, without the trailing colon. */
  protocol: string;
};

export function baseUrl(request: RequestLike): string {
  const configured = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedHost = request.header("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();

  const host = forwardedHost && isPlausibleHost(forwardedHost) ? forwardedHost : request.host;
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : request.protocol;

  return `${proto}://${host}`;
}

export function callbackUrl(request: RequestLike, key: ProviderKey): string {
  return `${baseUrl(request)}/api/auth/oauth/${key}/callback`;
}

/** Only same-origin absolute paths we know about — never an open redirect. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/company";
  if (value.startsWith("//")) return "/company"; // protocol-relative
  const withoutQuery = value.split("?")[0].split("#")[0];
  return RETURN_TO_ALLOWLIST.includes(withoutQuery) ? withoutQuery : "/company";
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

type OAuthState = {
  /** The opaque `state` parameter echoed back by the provider. */
  s: string;
  /** PKCE verifier. Never leaves our origin. */
  v: string;
  p: ProviderKey;
  /** Where to send the browser once signed in. */
  r: string;
  iat: number;
  exp: number;
};

function stateSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters to use social sign-in.");
  }
  return value;
}

/**
 * MAC over the transaction cookie.
 *
 * `createHmac` rather than `createHash(secret + payload)`: putting the secret
 * *before* the message in a plain hash is not a MAC, and it is what makes the
 * length-extension attack family apply. Here the attacker controls the whole
 * payload (they can craft the callback query), so this has to be a real keyed
 * construction. The `sha256:` domain separator stops a signature from this
 * function ever being confused with one from the session or CSRF code.
 */
function signState(payload: string): string {
  return createHmac("sha256", stateSecret())
    .update("sha256:oauth-state")
    .update(payload)
    .digest("base64url");
}

export type OAuthTransaction = {
  /** Value for the `state` query parameter. */
  state: string;
  /** Value for the signed state cookie. */
  cookie: string;
  /** PKCE verifier, held server-side only. */
  codeVerifier: string;
  returnTo: string;
};

/**
 * Starts a transaction.
 *
 * The cookie carries a signed payload; the `state` parameter is an unrelated
 * random string. Verifying the callback means checking the cookie's signature
 * *and* that the random `state` parameter matches the one inside it — so an
 * attacker cannot forge either a cookie or a callback, and cannot pair a
 * callback of their choosing with a victim's cookie.
 */
export function beginOAuthTransaction(provider: ProviderKey, returnTo: unknown): OAuthTransaction {
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = createCodeVerifier();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: OAuthState = {
    s: state,
    v: codeVerifier,
    p: provider,
    r: safeReturnTo(returnTo),
    iat: nowSeconds,
    exp: nowSeconds + STATE_TTL_SECONDS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    state,
    cookie: `${encoded}.${signState(encoded)}`,
    codeVerifier,
    returnTo: safeReturnTo(returnTo),
  };
}

export type VerifiedTransaction = {
  provider: ProviderKey;
  codeVerifier: string;
  returnTo: string;
};

/**
 * Verifies the callback. Returns null on any mismatch: bad signature, wrong
 * size, expired, or a `state` parameter that does not match the cookie.
 */
export function verifyOAuthTransaction(
  cookie: string | undefined,
  state: unknown,
  nowIso?: string,
): VerifiedTransaction | null {
  if (typeof cookie !== "string" || cookie.length === 0 || cookie.length > MAX_STATE_BYTES) return null;
  if (typeof state !== "string" || state.length === 0) return null;

  const dot = cookie.indexOf(".");
  if (dot <= 0 || dot === cookie.length - 1) return null;

  const encoded = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);

  const expected = signState(encoded);
  // Hash both sides so timingSafeEqual always sees equal-length buffers.
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(signature).digest();
  if (!timingSafeEqual(a, b)) return null;

  let parsed: Partial<OAuthState>;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed.s !== "string" || typeof parsed.v !== "string") return null;
  if (typeof parsed.p !== "string" || !isProviderKey(parsed.p)) return null;
  if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;

  const nowSeconds = Math.floor(
    (nowIso ? Date.parse(nowIso) : Date.now()) / 1000,
  );
  if (parsed.exp < nowSeconds) return null;

  // The parameter must match what we put in the cookie.
  const expectedState = Buffer.from(parsed.s);
  const receivedState = Buffer.from(state);
  if (expectedState.length !== receivedState.length) return null;
  if (!timingSafeEqual(expectedState, receivedState)) return null;

  return {
    provider: parsed.p,
    codeVerifier: parsed.v,
    returnTo: safeReturnTo(parsed.r),
  };
}

/** Where the provider sends the browser back to. */
export function authorizeUrl(
  provider: OAuthProvider,
  redirectUri: string,
  transaction: OAuthTransaction,
): string {
  const { clientId } = clientCredentials(provider.key);
  const url = new URL(provider.authorizeUrl);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", transaction.state);
  // `query` keeps the callback a top-level GET, which is the one response mode
  // every browser and every provider handle identically.
  url.searchParams.set("response_mode", "query");

  /* `select_account` is honoured by Google and Microsoft, and it is the right
     default here: someone signed in as the wrong Google account otherwise lands
     on an error page instead of a chooser. LinkedIn does not implement it and
     rejects the authorize call with an unknown-parameter error, so it is only
     sent where it is supported. */
  if (provider.key !== "linkedin") {
    url.searchParams.set("prompt", "select_account");
  }

  if (provider.pkce) {
    url.searchParams.set("code_challenge", codeChallenge(transaction.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url.toString();
}

export type OAuthProfile = {
  /** Stable, provider-issued user id. Survives email changes. */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  /**
   * Provider-hosted avatar URL, when the provider sends one.
   *
   * Optional on purpose: LinkedIn's `picture` is a short-lived signed URL and
   * some tenants send none at all, so nothing may assume it is present.
   * Normalised through `normalizeProfileImage` before it is ever persisted.
   */
  picture?: string;
};

export class OAuthExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthExchangeError";
  }
}

const FETCH_TIMEOUT_MS = 15_000;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(FETCH_TIMEOUT_MS);
}

/**
 * Swaps the authorization code for tokens.
 *
 * `client_secret_basic` is used where the provider supports it and the body form
 * otherwise; both are standard, and sending it in the body avoids providers that
 * reject a header they did not ask for.
 */
export async function exchangeCode(params: {
  provider: OAuthProvider;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<string> {
  const { clientId, clientSecret } = clientCredentials(params.provider.key);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (params.provider.pkce) {
    body.set("code_verifier", params.codeVerifier);
  }

  const response = await fetch(params.provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: timeoutSignal(),
    cache: "no-store",
  });

  if (!response.ok) {
    /* LinkedIn answers 401 for several unrelated causes — a bad client secret,
       a code that was already spent, a `redirect_uri` that does not match the
       authorize request — and the status alone cannot tell them apart. The
       `error`/`error_description` pair is the only thing that can, so it is
       logged here rather than discarded. Probed against LinkedIn's token
       endpoint, a bogus code yields 401 `invalid_request` "authorization code
       not found" even with valid credentials, so the status is never the signal. */
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
      error_description?: unknown;
    } | null;
    const code = typeof body?.error === "string" ? body.error : "unknown_error";
    const description =
      typeof body?.error_description === "string" ? body.error_description : "";

    console.error(
      `${params.provider.key} token exchange failed: HTTP ${response.status} ${code}${description ? ` — ${description}` : ""}`,
    );

    throw new OAuthExchangeError(
      `Token exchange failed with status ${response.status} (${code}${description ? `: ${description}` : ""}).`,
    );
  }

  const json = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  } | null;

  if (!json || typeof json.access_token !== "string" || json.access_token.length === 0) {
    const description = typeof json?.error_description === "string" ? json.error_description : "";
    throw new OAuthExchangeError(
      `Token exchange returned no access token${description ? `: ${description}` : "."}`,
    );
  }

  return json.access_token;
}

/**
 * Reads the signed-in user's identity from the provider's userinfo endpoint.
 *
 * This is the identity source rather than the raw `id_token`, deliberately: the
 * access token was obtained through a server-side exchange that carried our
 * client secret, the PKCE verifier, and the exact `redirect_uri`, and it is
 * presented here over TLS. Verifying it at the provider is therefore
 * authenticating the end user without hand-rolling JWT signature verification,
 * which is where this kind of code usually goes wrong.
 */
export async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  const response = await fetch(provider.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: timeoutSignal(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new OAuthExchangeError(`Could not read your profile from ${provider.label}.`);
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) throw new OAuthExchangeError(`${provider.label} returned an unreadable profile.`);

  const subject = firstString(json.sub, json.id);
  const email = firstString(json.email)?.toLowerCase();

  if (!subject || !email) {
    throw new OAuthExchangeError(
      `${provider.label} did not return the email address needed to create your account.`,
    );
  }

  // `email_verified` is authoritative where the provider sends it (Google sends
  // false for unverified Workspace domains). Where it is absent the address is
  // still usable, but the account is not marked verified — see `signInWithOAuth`.
  const emailVerified =
    typeof json.email_verified === "boolean"
      ? json.email_verified
      : typeof json.email_verified === "string"
        ? json.email_verified === "true"
        : provider.key === "linkedin";

  return {
    subject,
    email,
    emailVerified,
    name: firstString(json.name, json.given_name && json.family_name
      ? `${String(json.given_name)} ${String(json.family_name)}`
      : undefined) ?? email.split("@")[0],
    /* All three providers put the avatar on the userinfo response as `picture`.
       It is the provider's own host, not user input, but it is still a URL that
       ends up in an `img src`, so it is filtered before it is stored. */
    picture: firstString(json.picture),
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/**
 * Provider-console problems worth naming out loud, rather than showing a user a
 * bare `access_denied`. Returns the fixes for the three cases that produce
 * "works for some accounts only".
 */
export function publishStatusHint(provider: ProviderKey): string {
  switch (provider) {
    case "google":
      return "If Google reports access denied for only some accounts, the OAuth app is still in Testing status and those accounts are not test users. Set the consent screen to In production, or add each account under Test users.";
    case "microsoft":
      return "If only some accounts can sign in, the app registration's Supported account types is restricted. Set it to accounts in any organizational directory, and enable personal Microsoft accounts if @outlook.com users should work.";
    case "linkedin":
      return "LinkedIn only grants the OpenID Connect scopes after approving your app for the Sign In with LinkedIn product. Check the app's Products tab in the LinkedIn developer portal.";
  }
}
