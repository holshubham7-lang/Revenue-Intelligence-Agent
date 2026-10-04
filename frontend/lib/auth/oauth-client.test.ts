import assert from "node:assert/strict";
import { test } from "node:test";

import { startOAuth } from "./oauth-client.ts";

/**
 * The browser hand-off.
 *
 * The whole reason the social buttons used to do nothing was that they issued a
 * `fetch` and expected a cross-origin consent page to come back as a readable
 * response. It can't. These tests pin the replacement down at the level that
 * actually matters: exactly one navigation, issued synchronously, to a same-origin
 * path, with no fetch and no popup.
 */

/** Captures whatever the code under test does to `window.location`. */
function withLocation<T>(fn: () => T): { result: T; assignments: string[]; openCalls: number } {
  const assignments: string[] = [];
  let openCalls = 0;

  const original = globalThis.window;
  globalThis.window = {
    location: {
      assign: (url: string) => {
        assignments.push(url);
      },
    },
    open: () => {
      openCalls += 1;
      return null;
    },
  } as unknown as Window & typeof globalThis;

  try {
    return { result: fn(), assignments, openCalls };
  } finally {
    if (original === undefined) delete (globalThis as { window?: unknown }).window;
    else globalThis.window = original;
  }
}

/** Fails if the module reaches for anything that is not a top-level navigation. */
function forbidNetwork() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("startOAuth must not issue a fetch");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("starting sign-in navigates to the provider's start endpoint", () => {
  for (const provider of ["google", "microsoft", "linkedin"] as const) {
    const { assignments, openCalls } = withLocation(() => startOAuth(provider));

    assert.deepEqual(assignments, [`/api/auth/oauth/${provider}`]);
    assert.equal(openCalls, 0, "a popup would be blocked by Safari's ITP");
  }
});

test("no request is issued before navigating", () => {
  const restore = forbidNetwork();
  try {
    const { assignments } = withLocation(() => startOAuth("google"));
    assert.deepEqual(assignments, ["/api/auth/oauth/google"]);
  } finally {
    restore();
  }
});

test("the destination stays on our own origin", () => {
  /* A cross-origin path here would be the original bug in a different form: the
     provider consent page must be reached by the *browser*, not by script. */
  const { assignments } = withLocation(() => startOAuth("google"));
  for (const url of assignments) {
    assert.ok(url.startsWith("/"), `${url} must be a same-origin path`);
    assert.ok(!url.startsWith("//"), `${url} must not be protocol-relative`);
    assert.ok(!url.includes(":"), `${url} must not carry a scheme`);
  }
});

test("the navigation is issued synchronously, before the promise resolves", () => {
  /* An `await` before `window.location` opens a window for a re-render or a
     second click to cancel the navigation, leaving a spinner that never
     resolves. */
  const { result, assignments } = withLocation(() => startOAuth("google"));

  assert.equal(assignments.length, 1, "the assignment must already have happened on return");
  assert.deepEqual(result, { ok: true, navigated: true });
});

test("the result is not a promise, so a caller cannot accidentally defer it", () => {
  const { result } = withLocation(() => startOAuth("google"));
  assert.ok(
    !(result instanceof Promise),
    "startOAuth must stay synchronous; an async signature invites an await",
  );
});
