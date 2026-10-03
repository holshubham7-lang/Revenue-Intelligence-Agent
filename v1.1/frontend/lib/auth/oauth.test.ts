import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";

import {
  authorizeUrl,
  beginOAuthTransaction,
  callbackUrl,
  codeChallenge,
  exchangeCode,
  fetchProfile,
  isProviderKey,
  providerConfig,
  publishStatusHint,
  safeReturnTo,
  verifyOAuthTransaction,
  type ProviderKey,
} from "./oauth.ts";

/* The module reads these lazily, so tests can set them per case. */
process.env.AUTH_SECRET = "test-secret-that-is-definitely-long-enough-32";
process.env.GOOGLE_CLIENT_ID = "google-id.apps.example";
process.env.GOOGLE_CLIENT_SECRET = "google-secret";
process.env.MICROSOFT_CLIENT_ID = "microsoft-id";
process.env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
process.env.LINKEDIN_CLIENT_ID = "linkedin-id";
process.env.LINKEDIN_CLIENT_SECRET = "linkedin-secret";

const NOW_ISO = new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Provider configuration                                                     */
/* -------------------------------------------------------------------------- */

test("every provider is reachable and names its own endpoints", () => {
  for (const key of ["google", "microsoft", "linkedin"] as const) {
    const config = providerConfig(key);
    assert.ok(config.authorizeUrl.startsWith("https://"), `${key} authorize must be https`);
    assert.ok(config.tokenUrl.startsWith("https://"), `${key} token must be https`);
    assert.ok(config.userInfoUrl.startsWith("https://"), `${key} userinfo must be https`);
    assert.ok(config.scopes.includes("openid"), `${key} needs the openid scope for identity`);
    assert.ok(config.scopes.includes("email"), `${key} needs the email scope to key the account`);
  }
});

test("microsoft defaults to the multi-tenant endpoint so it is not limited to one org", () => {
  const previous = process.env.MICROSOFT_TENANT;
  delete process.env.MICROSOFT_TENANT;
  try {
    const config = providerConfig("microsoft");
    assert.match(config.authorizeUrl, /\/common\/oauth2\/v2\.0\/authorize$/);
    assert.match(config.tokenUrl, /\/common\/oauth2\/v2\.0\/token$/);
  } finally {
    if (previous !== undefined) process.env.MICROSOFT_TENANT = previous;
  }
});

test("microsoft honours an explicit single-tenant restriction", () => {
  process.env.MICROSOFT_TENANT = "contoso.onmicrosoft.com";
  try {
    assert.match(
      providerConfig("microsoft").authorizeUrl,
      /contoso\.onmicrosoft\.com/,
    );
  } finally {
    delete process.env.MICROSOFT_TENANT;
  }
});

test("only the three intended providers are accepted", () => {
  assert.ok(isProviderKey("google"));
  assert.ok(isProviderKey("microsoft"));
  assert.ok(isProviderKey("linkedin"));
  for (const bad of ["apple", "GOOGLE", "g oogle", "", "google ", "facebook", "../google"]) {
    assert.ok(!isProviderKey(bad), `${bad} must not be accepted`);
  }
});

/* -------------------------------------------------------------------------- */
/* PKCE                                                                       */
/* -------------------------------------------------------------------------- */

test("the code challenge is the S256 hash of the verifier, per RFC 7636", () => {
  const verifier = beginOAuthTransaction("google", null).codeVerifier;
  assert.equal(
    codeChallenge(verifier),
    createHash("sha256").update(verifier).digest("base64url"),
  );
  // 43-128 characters from the unreserved set.
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier length ${verifier.length}`);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
});

test("each transaction gets a fresh verifier", () => {
  const a = beginOAuthTransaction("google", null);
  const b = beginOAuthTransaction("google", null);
  assert.notEqual(a.codeVerifier, b.codeVerifier);
  assert.notEqual(a.state, b.state);
});

/* -------------------------------------------------------------------------- */
/* Return-to                                                                  */
/* -------------------------------------------------------------------------- */

test("returnTo only allows known internal paths", () => {
  assert.equal(safeReturnTo("/company"), "/company");
  assert.equal(safeReturnTo("/chat"), "/chat");
  assert.equal(safeReturnTo("/company/action-plan"), "/company/action-plan");
});

test("returnTo refuses every shape of off-site redirect", () => {
  for (const attack of [
    "https://evil.example",
    "//evil.example",
    "http://evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "/company/../../admin",
    "/admin",
    "/signout",
    "",
    null,
    undefined,
    42,
    { toString: () => "/company" },
  ]) {
    assert.equal(safeReturnTo(attack), "/company", `${String(attack)} must not be honoured`);
  }
});

test("returnTo drops query and fragment from an allowed path", () => {
  assert.equal(safeReturnTo("/company?next=https://evil.example"), "/company");
  assert.equal(safeReturnTo("/chat#x"), "/chat");
});

test("returnTo survives the round trip through the signed state", () => {
  const transaction = beginOAuthTransaction("google", "/chat");
  const verified = verifyOAuthTransaction(transaction.cookie, transaction.state, NOW_ISO);
  assert.equal(verified?.returnTo, "/chat");
});

test("a hostile returnTo cannot survive the state round trip", () => {
  const transaction = beginOAuthTransaction("google", "https://evil.example");
  const verified = verifyOAuthTransaction(transaction.cookie, transaction.state, NOW_ISO);
  assert.equal(verified?.returnTo, "/company");
});

/* -------------------------------------------------------------------------- */
/* State verification                                                         */
/* -------------------------------------------------------------------------- */

test("a matching cookie and state verify", () => {
  const transaction = beginOAuthTransaction("microsoft", "/company");
  const verified = verifyOAuthTransaction(transaction.cookie, transaction.state, NOW_ISO);
  assert.ok(verified);
  assert.equal(verified.provider, "microsoft");
  assert.equal(verified.codeVerifier, transaction.codeVerifier);
});

test("a state parameter from another transaction is rejected", () => {
  const mine = beginOAuthTransaction("google", null);
  const theirs = beginOAuthTransaction("google", null);
  assert.equal(verifyOAuthTransaction(mine.cookie, theirs.state, NOW_ISO), null);
});

test("a tampered cookie is rejected", () => {
  const transaction = beginOAuthTransaction("google", null);
  const dot = transaction.cookie.indexOf(".");
  const payload = transaction.cookie.slice(0, dot);

  // Re-sign a payload whose verifier was swapped for one an attacker controls.
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  forged.v = "attacker-verifier";
  const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");

  assert.equal(
    verifyOAuthTransaction(`${forgedPayload}.${transaction.cookie.slice(dot + 1)}`, transaction.state, NOW_ISO),
    null,
    "a payload edit must not verify under the original signature",
  );
});

test("an unsigned cookie with a valid-looking payload is rejected", () => {
  const transaction = beginOAuthTransaction("google", null);
  const dot = transaction.cookie.indexOf(".");
  const payload = transaction.cookie.slice(0, dot);
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");
  assert.equal(verifyOAuthTransaction(`${forgedPayload}.bogus`, transaction.state, NOW_ISO), null);
});

test("the state MAC is not a plain hash of secret+payload", () => {
  /* Guards the exact construction, not just its behaviour. A digest like
     `sha256(secret + payload)` is length-extendable; `sha256(payload + secret)`
     has no key at all. Only an HMAC survives both. */
  const transaction = beginOAuthTransaction("google", null);
  const dot = transaction.cookie.indexOf(".");
  const payload = transaction.cookie.slice(0, dot);
  const signature = transaction.cookie.slice(dot + 1);

  const naive = createHash("sha256")
    .update(`${process.env.AUTH_SECRET}\u0000oauth-state`)
    .update(payload)
    .digest("base64url");

  assert.notEqual(signature, naive, "the signature must come from createHmac, not createHash");
  assert.equal(verifyOAuthTransaction(transaction.cookie, transaction.state, NOW_ISO)?.provider, "google");
});

test("a state cookie signed by a different secret is rejected", () => {
  const transaction = beginOAuthTransaction("google", null);

  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "a-completely-different-secret-32-chars-long!!";
  try {
    assert.equal(
      verifyOAuthTransaction(transaction.cookie, transaction.state, NOW_ISO),
      null,
      "a rotated or guessed secret must not validate old cookies",
    );
  } finally {
    process.env.AUTH_SECRET = original;
  }
});

test("an expired transaction is rejected", () => {
  const transaction = beginOAuthTransaction("google", null);
  const elevenMinutesLater = new Date(Date.now() + 11 * 60_000).toISOString();
  assert.equal(verifyOAuthTransaction(transaction.cookie, transaction.state, elevenMinutesLater), null);
});

test("a transaction still verifies inside its ten-minute window", () => {
  const transaction = beginOAuthTransaction("google", null);
  const nineMinutesLater = new Date(Date.now() + 9 * 60_000).toISOString();
  assert.ok(verifyOAuthTransaction(transaction.cookie, transaction.state, nineMinutesLater));
});

test("a provider swap inside a valid cookie is still refused", () => {
  const transaction = beginOAuthTransaction("google", null);
  // The cookie says google; the callback path says linkedin.
  const verified = verifyOAuthTransaction(transaction.cookie, transaction.state, NOW_ISO);
  assert.equal(verified?.provider, "google");
  assert.notEqual(verified?.provider, "linkedin");
});

test("malformed state inputs are rejected without throwing", () => {
  for (const bad of [
    undefined, "", ".", "..", "a.b", ".b", "a.", "x".repeat(5000),
  ]) {
    assert.doesNotThrow(() => verifyOAuthTransaction(bad, "state", NOW_ISO));
    assert.equal(verifyOAuthTransaction(bad, "state", NOW_ISO), null);
  }
});

test("the PKCE verifier never appears in the state parameter", () => {
  const transaction = beginOAuthTransaction("google", null);
  // `state` is the raw random value, so the verifier cannot have leaked into it
  // even though both live in the same module.
  assert.ok(!transaction.state.includes(transaction.codeVerifier));
  assert.notEqual(transaction.state, transaction.codeVerifier);
});

/* -------------------------------------------------------------------------- */
/* Callback URL                                                               */
/* -------------------------------------------------------------------------- */

test("a header that smuggles a path or query into the redirect_uri is refused", () => {
  const previous = process.env.APP_BASE_URL;
  delete process.env.APP_BASE_URL;
  try {
    for (const hostile of [
      "evil.example/#",
      "evil.example?next=1",
      "evil.example/path",
      "evil.example:notaport",
      "..",
      "evil.example/%0d%0aX-Injected:1",
    ]) {
      const request = new Request("http://localhost:3000/api/auth/oauth/google", {
        headers: { "x-forwarded-host": hostile, "x-forwarded-proto": "https" },
      });
      const built = callbackUrl(request, "google");
      assert.equal(
        built,
        "https://localhost:3000/api/auth/oauth/google/callback",
        `${JSON.stringify(hostile)} must fall back to the real request origin`,
      );
    }
  } finally {
    if (previous !== undefined) process.env.APP_BASE_URL = previous;
  }
});

test("a non-http x-forwarded-proto is ignored", () => {
  const previous = process.env.APP_BASE_URL;
  delete process.env.APP_BASE_URL;
  try {
    const request = new Request("http://localhost:3000/api/auth/oauth/google", {
      headers: { "x-forwarded-proto": "javascript" },
    });
    assert.equal(callbackUrl(request, "google"), "http://localhost:3000/api/auth/oauth/google/callback");
  } finally {
    if (previous !== undefined) process.env.APP_BASE_URL = previous;
  }
});

test("the callback URL follows the request host, with APP_BASE_URL winning", () => {
  const request = new Request("http://localhost:3000/api/auth/oauth/google");
  assert.equal(callbackUrl(request, "google"), "http://localhost:3000/api/auth/oauth/google/callback");

  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://app.example.com/";
  try {
    assert.equal(
      callbackUrl(request, "google"),
      "https://app.example.com/api/auth/oauth/google/callback",
      "a trailing slash on APP_BASE_URL must not double up",
    );
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previous;
  }
});

test("a proxied deployment builds its callback from the forwarded host", () => {
  const previous = process.env.APP_BASE_URL;
  delete process.env.APP_BASE_URL;
  try {
    const request = new Request("http://internal:3000/api/auth/oauth/microsoft", {
      headers: { "x-forwarded-host": "revops.example.com", "x-forwarded-proto": "https" },
    });
    assert.equal(
      callbackUrl(request, "microsoft"),
      "https://revops.example.com/api/auth/oauth/microsoft/callback",
    );
  } finally {
    if (previous !== undefined) process.env.APP_BASE_URL = previous;
  }
});

/* -------------------------------------------------------------------------- */
/* Userinfo                                                                   */
/* -------------------------------------------------------------------------- */

function withFetchStub(body: unknown, init: { ok?: boolean; status?: number } = {}, capture?: { url?: string; init?: RequestInit }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
    if (capture) {
      capture.url = String(input);
      capture.init = options;
    }
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("a verified Google address is read as verified", async () => {
  const restore = withFetchStub({ sub: "1", email: "A@Example.COM", email_verified: true, name: "Ada" });
  try {
    const profile = await fetchProfile(
      providerConfig("google"),
      "token",
    );
    assert.equal(profile.email, "a@example.com", "the email must be normalized");
    assert.equal(profile.subject, "1");
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.name, "Ada");
  } finally {
    restore();
  }
});

test("an explicitly unverified address stays unverified — this gates account linking", async () => {
  const restore = withFetchStub({ sub: "1", email: "a@example.com", email_verified: false, name: "Ada" });
  try {
    const profile = await fetchProfile(providerConfig("google"), "token");
    assert.equal(profile.emailVerified, false);
  } finally {
    restore();
  }
});

test("a string boolean for email_verified is parsed", async () => {
  const restore = withFetchStub({ sub: "1", email: "a@example.com", email_verified: "false" });
  try {
    assert.equal((await fetchProfile(providerConfig("google"), "token")).emailVerified, false);
  } finally {
    restore();
  }
});

test("an absent email_verified is not treated as verified", async () => {
  const restore = withFetchStub({ sub: "1", email: "a@example.com" });
  try {
    assert.equal(
      (await fetchProfile(providerConfig("google"), "token")).emailVerified,
      false,
      "silence from the provider must not be read as consent to link",
    );
  } finally {
    restore();
  }
});

test("a provider error never yields a profile", async () => {
  const restore = withFetchStub({}, { ok: false, status: 401 });
  try {
    await assert.rejects(() => fetchProfile(providerConfig("google"), "token"), /Could not read/);
  } finally {
    restore();
  }
});

test("a profile with no email is refused rather than half-created", async () => {
  const restore = withFetchStub({ sub: "1", name: "Ada" });
  try {
    await assert.rejects(
      () => fetchProfile(providerConfig("google"), "token"),
      /email address needed/,
    );
  } finally {
    restore();
  }
});

test("a name falls back rather than leaving the account blank", async () => {
  const restore = withFetchStub({ sub: "1", email: "solo@example.com" });
  try {
    assert.equal((await fetchProfile(providerConfig("google"), "token")).name, "solo");
  } finally {
    restore();
  }
});

test("split given/family names are joined", async () => {
  const restore = withFetchStub({
    sub: "1",
    email: "a@example.com",
    given_name: "Ada",
    family_name: "Lovelace",
  });
  try {
    assert.equal((await fetchProfile(providerConfig("google"), "token")).name, "Ada Lovelace");
  } finally {
    restore();
  }
});

/* -------------------------------------------------------------------------- */
/* Token exchange                                                             */
/* -------------------------------------------------------------------------- */

test("the exchange sends the code, the redirect_uri, and the PKCE verifier", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  const restore = withFetchStub(
    { access_token: "at" },
    {},
    capture,
  );
  try {
    const token = await exchangeCode({
      provider: providerConfig("google"),
      code: "auth-code",
      redirectUri: "https://app.example.com/api/auth/oauth/google/callback",
      codeVerifier: "verifier-value",
    });
    assert.equal(token, "at");

    const body = new URLSearchParams(String(capture.init?.body));
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "auth-code");
    assert.equal(
      body.get("redirect_uri"),
      "https://app.example.com/api/auth/oauth/google/callback",
    );
    assert.equal(body.get("code_verifier"), "verifier-value");
    assert.equal(body.get("client_id"), "google-id.apps.example");
    assert.equal(body.get("client_secret"), "google-secret");
  } finally {
    restore();
  }
});

test("an error response from the token endpoint is surfaced, not swallowed", async () => {
  const restore = withFetchStub(
    { error: "invalid_grant" },
    { ok: false, status: 400 },
  );
  try {
    await assert.rejects(
      () =>
        exchangeCode({
          provider: providerConfig("google"),
          code: "used-once",
          redirectUri: "https://app.example.com/cb",
          codeVerifier: "v",
        }),
      /status 400/,
    );
  } finally {
    restore();
  }
});

test("a 200 with no access token is still a failure", async () => {
  const restore = withFetchStub({ error: "invalid_client" }, {});
  try {
    await assert.rejects(
      () =>
        exchangeCode({
          provider: providerConfig("google"),
          code: "c",
          redirectUri: "https://app.example.com/cb",
          codeVerifier: "v",
        }),
      /no access token/,
    );
  } finally {
    restore();
  }
});

/* -------------------------------------------------------------------------- */
/* Operator guidance                                                          */
/* -------------------------------------------------------------------------- */

test("the authorize URL carries everything the callback will need", () => {
  const transaction = beginOAuthTransaction("google", "/chat");
  const url = new URL(
    authorizeUrl(providerConfig("google"), "https://app.example.com/cb", transaction),
  );

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "google-id.apps.example");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example.com/cb");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("response_mode"), "query", "query keeps it a top-level GET");
  assert.equal(url.searchParams.get("state"), transaction.state);
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), codeChallenge(transaction.codeVerifier));
});

test("linkedin is not sent prompt=select_account", () => {
  const transaction = beginOAuthTransaction("linkedin", null);
  const url = new URL(
    authorizeUrl(providerConfig("linkedin"), "https://app.example.com/cb", transaction),
  );
  assert.equal(
    url.searchParams.get("prompt"),
    null,
    "LinkedIn rejects the authorize request when prompt is present",
  );
});

test("google and microsoft do get prompt=select_account", () => {
  for (const key of ["google", "microsoft"] as const) {
    const transaction = beginOAuthTransaction(key, null);
    const url = new URL(
      authorizeUrl(providerConfig(key), "https://app.example.com/cb", transaction),
    );
    assert.equal(url.searchParams.get("prompt"), "select_account", `${key} should offer the picker`);
  }
});

test("microsoft does not request the Graph User.Read permission", () => {
  /* User.Read pulls Microsoft Graph into the consent prompt. Where the tenant
     requires admin consent, that turns "sign in with Microsoft" into a refusal
     for everyone outside the registering organisation — the exact failure this
     feature is meant to fix. The OIDC userinfo endpoint needs none of it. */
  const scopes = providerConfig("microsoft").scopes;
  assert.ok(!scopes.some((s) => s.toLowerCase() === "user.read"), `unexpected scope in ${scopes.join(",")}`);
  for (const required of ["openid", "email", "profile"]) {
    assert.ok(scopes.includes(required), `missing ${required}`);
  }
});

test("each provider explains its own account-restriction cause", () => {
  // These are the three "works for me, not for them" cases, so each has to name
  // the console setting rather than leaving a bare access_denied.
  assert.match(publishStatusHint("google"), /Testing/);
  assert.match(publishStatusHint("google"), /test users/i);
  assert.match(publishStatusHint("microsoft"), /Supported account types/);
  assert.match(publishStatusHint("linkedin"), /OpenID Connect/);
});

test("the hint covers every provider key", () => {
  for (const key of ["google", "microsoft", "linkedin"] as ProviderKey[]) {
    const hint = publishStatusHint(key);
    assert.ok(hint.length > 40, `${key} hint should be actionable`);
  }
});
