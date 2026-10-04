import assert from "node:assert/strict";
import { test } from "node:test";

import { csrfPasses, csrfCookieOptions, CSRF_COOKIE, CSRF_HEADER } from "./csrf.ts";
import { sessionCookieOptions, SESSION_TTL_SECONDS } from "./session.ts";

/**
 * The cookie helpers, exercised against a stand-in for Express's `res.cookie`.
 *
 * The real bug these lock down: the shared option objects express lifetimes in
 * **seconds** (they are plain data, shared with the ported domain logic), while
 * Express's `res.cookie` reads `maxAge` in **milliseconds**. Passing seconds
 * through unchanged gave `maxAge: 600` a lifetime of 0.6s, which the `cookie`
 * module floors to `Max-Age=0` — an already-expired cookie. The OAuth state
 * cookie was dropped before the provider round-tripped, so every social sign-in
 * returned `state_mismatch`, and the 30-day session quietly became 43 minutes.
 *
 * Nothing crashed and no test failed, which is why the fix belongs here: the
 * conversion is the only thing standing between the two units.
 */

/** Mirrors the arithmetic Express performs before writing a `Set-Cookie`. */
function serialize(
  options: { maxAge: number; path: string; sameSite: string; httpOnly: boolean; secure: boolean },
): { maxAgeSeconds: number; header: string } {
  const maxAgeSeconds = Math.floor(options.maxAge / 1000);
  const parts = [`revops_test=${"v"}`, `Max-Age=${maxAgeSeconds}`, `Path=${options.path}`];
  if (options.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  return { maxAgeSeconds, header: parts.join("; ") };
}

test("the CSRF cookie is set for an hour, not zero seconds", () => {
  const options = csrfCookieOptions();
  const { maxAgeSeconds } = serialize({ ...options, maxAge: options.maxAge * 1000 });
  assert.equal(maxAgeSeconds, 3600);
  assert.ok(maxAgeSeconds > 0, "a Max-Age of 0 is an already-expired cookie");
});

test("the session cookie is set for 30 days, not 43 minutes", () => {
  const options = sessionCookieOptions();
  const { maxAgeSeconds } = serialize({ ...options, maxAge: options.maxAge * 1000 });
  assert.equal(maxAgeSeconds, SESSION_TTL_SECONDS);
  assert.equal(maxAgeSeconds, 60 * 60 * 24 * 30);
});

test("a cookie cleared with maxAge 0 is born expired", () => {
  /* This is what the OAuth state and error cookies do on every failed callback. */
  const { maxAgeSeconds } = serialize({
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 0,
    path: "/",
  });
  assert.equal(maxAgeSeconds, 0);
});

test("the CSRF cookie is readable by script and strict, the session is not", () => {
  /* The double-submit pattern needs the CSRF token in JS; the session token must
     never be. Getting these backwards silently breaks one or the other. */
  assert.equal(csrfCookieOptions().httpOnly, false);
  assert.equal(csrfCookieOptions().sameSite, "strict");
  assert.equal(sessionCookieOptions().httpOnly, true);
  assert.equal(sessionCookieOptions().sameSite, "lax");
});

test("the double-submit check requires the cookie and the header to agree", () => {
  const token = "a".repeat(64);
  assert.equal(csrfPasses(token, token), true);

  /* Each of these was a real failure mode worth keeping a test for. */
  assert.equal(csrfPasses(token, "b".repeat(64)), false, "a mismatched pair must fail");
  assert.equal(csrfPasses(undefined, token), false, "no cookie must fail");
  assert.equal(csrfPasses(token, null), false, "no header must fail");
  assert.equal(csrfPasses("", ""), false, "an empty pair must not pass");
});

test("the CSRF names are the ones the client sends", () => {
  /* The browser reads the cookie under CSRF_COOKIE and echoes it in CSRF_HEADER;
     a rename on either side without the other breaks every form silently. */
  assert.equal(CSRF_COOKIE, "revops_csrf");
  assert.equal(CSRF_HEADER, "x-csrf-token");
});
