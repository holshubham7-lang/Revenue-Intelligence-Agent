import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";

import { readFormBody, readQuery, toRequestLike } from "./http.ts";

/**
 * Query and body parameter flattening.
 *
 * This exists because Express and the browser's `URLSearchParams` disagree about
 * what a repeated or bracketed parameter is:
 *
 *   ?state=abc        ->  both give the string "abc"
 *   ?state=a&state=b  ->  URLSearchParams.get() gives "a"; Express gives ["a","b"]
 *   ?state[ver]=x     ->  URLSearchParams.get("state") gives null, because it
 *                         looks for the literal key "state[ver]";
 *                        Express gives the object { ver: "x" }
 *
 * The OAuth callback compares `state` against a signed cookie, so the value has
 * to stay a string or absent. Coercing an object with `String()` would produce
 * "[object Object]" — a mismatch with no way to tell a forgery attempt from a
 * framework quirk. Non-strings are therefore dropped, matching `get()`.
 */

function requestWith(
  query: Record<string, unknown>,
  body?: unknown,
  headers: Record<string, string | string[]> = {},
) {
  return {
    query,
    body,
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    hostname: "localhost",
    protocol: "http",
  } as unknown as Request;
}

test("a plain parameter comes through unchanged", () => {
  assert.deepEqual(readQuery(requestWith({ state: "abc", code: "xyz" })), { state: "abc", code: "xyz" });
});

test("a bracketed parameter is absent, not an object", () => {
  /* The forgery attempt this exists for: Express parses `?state[ver]=forged`
     into an object, which would not be `undefined` further downstream. */
  const parsed = readQuery(requestWith({ state: { ver: "forged" } }));
  assert.equal(parsed.state, undefined);
  assert.deepEqual(Object.keys(parsed), []);
});

test("an array parameter collapses to its first value", () => {
  assert.equal(readQuery(requestWith({ code: ["first", "second"] })).code, "first");
});

test("a numeric parameter is dropped, not stringified", () => {
  assert.equal(readQuery(requestWith({ code: 12345 })).code, undefined);
});

test("an empty-string value is kept, because it is still a value", () => {
  /* Distinguishing "" from absent matters: the routes check `if (!code)`, so
     dropping "" here would change nothing, but silently dropping empty strings
     generally hides malformed input. */
  assert.equal(readQuery(requestWith({ code: "" })).code, "");
});

test("a form_post body flattens the same way", () => {
  const request = requestWith({}, { state: "abc", error: "access_denied" });
  assert.deepEqual(readFormBody(request), { state: "abc", error: "access_denied" });
});

test("a non-object body yields no parameters instead of throwing", () => {
  assert.deepEqual(readFormBody(requestWith({}, "just a string")), {});
  assert.deepEqual(readFormBody(requestWith({}, ["a", "b"])), {});
  assert.deepEqual(readFormBody(requestWith({}, undefined)), {});
});

test("toRequestLike keeps the port in the host", () => {
  /* Express's `req.hostname` drops the port, which would build
     `http://localhost/api/auth/oauth/...` and lose the `:3000` that every
     registered callback URL carries. */
  const like = toRequestLike(requestWith({}, undefined, { host: "localhost:3000" }));
  assert.equal(like.host, "localhost:3000");
  assert.equal(like.protocol, "http");
});

test("toRequestLike looks headers up case-insensitively", () => {
  const like = toRequestLike(
    requestWith({}, undefined, { "x-forwarded-host": "revops.example.com" }),
  );
  assert.equal(like.header("X-Forwarded-Host"), "revops.example.com");
  assert.equal(like.header("x-forwarded-host"), "revops.example.com");
  assert.equal(like.header("x-missing"), undefined);
});

test("toRequestLike takes the first value of a repeated header", () => {
  const like = toRequestLike(
    requestWith({}, undefined, { "x-forwarded-proto": ["https", "http"] }),
  );
  assert.equal(like.header("x-forwarded-proto"), "https");
});
