import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consumeRelayToken,
  createRelayToken,
  relayCallbackUrl,
  relayEnabled,
  relayOrigin,
  relayStartUrl,
} from "./oauth-relay.ts";

/* Read lazily, so each case can set its own. */
process.env.AUTH_SECRET = "test-secret-that-is-definitely-long-enough-32";

const SECRET = process.env.AUTH_SECRET;

const HANDOFF = { userId: "6543210fedcba98765432100", tokenVersion: 3, returnTo: "/company" };

/** Runs `fn` with `AUTH_RELAY_URL` pinned, restoring whatever was there before. */
function withRelayUrl(value: string | undefined, fn: () => void): void {
  const previous = process.env.AUTH_RELAY_URL;
  process.env.AUTH_RELAY_URL = value;
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_RELAY_URL;
    } else {
      process.env.AUTH_RELAY_URL = previous;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Origin                                                                     */
/* -------------------------------------------------------------------------- */

test("relay mode is off unless AUTH_RELAY_URL is a usable origin", () => {
  for (const value of [undefined, "", "   "]) {
    withRelayUrl(value, () => {
      assert.equal(relayOrigin(), null);
      assert.equal(relayEnabled(), false);
    });
  }
});

test("a configured relay origin is normalised to scheme and host only", () => {
  withRelayUrl("https://revops-api-dev.azurewebsites.net/", () => {
    assert.equal(relayOrigin(), "https://revops-api-dev.azurewebsites.net");
    assert.equal(relayEnabled(), true);
  });

  /* A trailing slash alone is harmless; anything below would break the provider's
     literal redirect_uri comparison, so it must not be accepted. */
  for (const bad of [
    "https://api.example.com/callback",
    "https://api.example.com?x=1",
    "https://api.example.com#f",
    "ftp://api.example.com",
    "not a url",
    "api.example.com",
  ]) {
    withRelayUrl(bad, () => assert.equal(relayOrigin(), null, `${bad} must be rejected`));
  }
});

test("the callback URL is the registered path, derived from one place", () => {
  withRelayUrl("https://api.example.com", () => {
    assert.equal(relayStartUrl("google"), "https://api.example.com/auth/social/google");
    /* Both providers that get probed by a console, and the exact shape the
       registration list is written against. */
    for (const provider of ["google", "microsoft", "linkedin"] as const) {
      assert.equal(
        relayCallbackUrl(provider),
        `https://api.example.com/auth/social/${provider}/callback`,
      );
    }
  });
});

test("relay URLs cannot be built while the relay is off", () => {
  withRelayUrl(undefined, () => {
    assert.throws(() => relayStartUrl("google"), /AUTH_RELAY_URL/);
    assert.throws(() => relayCallbackUrl("google"), /AUTH_RELAY_URL/);
  });
});

/* -------------------------------------------------------------------------- */
/* Handoff token                                                              */
/* -------------------------------------------------------------------------- */

test("a handoff token survives one round trip and carries its claims", () => {
  const spent = consumeRelayToken(createRelayToken(HANDOFF));
  assert.deepEqual(spent, {
    userId: HANDOFF.userId,
    tokenVersion: HANDOFF.tokenVersion,
    returnTo: HANDOFF.returnTo,
  });
});

test("a token can only be spent once", () => {
  const token = createRelayToken(HANDOFF);
  assert.ok(consumeRelayToken(token));
  /* The replay defence: a second spend must fail even well inside the TTL. */
  assert.equal(consumeRelayToken(token), null);
});

test("anything that is not a validly signed token is refused", () => {
  const token = createRelayToken(HANDOFF);
  const [payload] = token.split(".");

  const forgeries = [
    "",
    token + "x",
    payload ?? "",
    `${payload}.${"A".repeat(43)}`,
    `${Buffer.from(JSON.stringify({ k: "oauth_relay", sub: "someone-else", ver: 0, r: "/company", jti: "x", iat: 0, exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url")}.whatever`,
    "a.b.c",
  ];
  for (const value of forgeries) {
    assert.equal(consumeRelayToken(value), null, JSON.stringify(value).slice(0, 40));
  }
  assert.equal(consumeRelayToken(undefined), null);
  assert.equal(consumeRelayToken({ token }), null);
});

test("a token signed with a different secret is refused", () => {
  const token = createRelayToken(HANDOFF);
  const [payload] = token.split(".");

  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "a-completely-different-secret-32-chars!!";
  try {
    assert.equal(consumeRelayToken(`${payload}.ignored`), null);
  } finally {
    process.env.AUTH_SECRET = previous ?? SECRET;
  }
});

test("a handoff token expires on its own clock", () => {
  const token = createRelayToken(HANDOFF);
  const realNow = Date.now;
  /* Sixty-one seconds on: past the one redirect the token exists to survive. */
  Date.now = () => realNow() + 61_000;
  try {
    assert.equal(consumeRelayToken(token), null);
  } finally {
    Date.now = realNow;
  }
});

test("an unchecked destination is pulled back to the allowlist on the way out", () => {
  /* The minting side signs what it is given; the consuming side must not turn a
     bad `r` into an open redirect. */
  for (const [given, expected] of [
    ["//evil.example.com", "/company"],
    ["https://evil.example.com", "/company"],
    ["/not-a-route", "/company"],
  ] as const) {
    const claims = consumeRelayToken(createRelayToken({ ...HANDOFF, returnTo: given }));
    assert.equal(claims?.returnTo, expected);
  }
});
