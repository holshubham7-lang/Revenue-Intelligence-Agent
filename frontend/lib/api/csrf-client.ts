/**
 * Client-side helper for POSTs that need the double-submit CSRF header.
 *
 * `revops_csrf` has a 1-hour `maxAge`, so a tab left open longer than that
 * (a long onboarding interview, an abandoned company form) still holds a token
 * whose cookie the browser has already dropped — the server then rejects every
 * request with `csrf_failed` and the user is stuck until they reload.
 *
 * `postJson` recovers from that transparently: it fetches a token, sends the
 * request, and on a `csrf_failed` rejection fetches a fresh token and replays
 * the request exactly once. The retry is gated on the error code so a genuine
 * 403 for another reason is never masked or repeated.
 */

/** Shared across the app so one refresh benefits every open component. */
let cachedToken: string | null = null;
/** De-duplicates concurrent fetches so a burst sends one request. */
let inFlight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { credentials: "include" });
  if (!response.ok) throw new Error("csrf_failed");

  const data = (await response.json()) as { csrfToken?: string };
  if (!data.csrfToken) throw new Error("csrf_failed");
  return data.csrfToken;
}

/**
 * Returns the current CSRF token, fetching one if needed. Pass `force` to drop
 * the cached value — used when the server has told us it is no longer valid.
 */
export async function getCsrfToken(force = false): Promise<string> {
  if (!force && cachedToken) return cachedToken;
  if (!force && inFlight) return inFlight;

  const pending = requestToken().then((token) => {
    cachedToken = token;
    return token;
  });

  inFlight = pending;
  try {
    return await pending;
  } finally {
    if (inFlight === pending) inFlight = null;
  }
}

/** True when a rejection response is specifically a CSRF failure. */
async function isCsrfFailure(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  // Read from a clone so the caller can still consume the original body.
  return response
    .clone()
    .json()
    .then(
      (data: { error?: { code?: string } }) => data?.error?.code === "csrf_failed",
      () => false,
    );
}

/**
 * POSTs `body` as JSON with the CSRF header attached, retrying once with a
 * fresh token if the cached one had expired. The body must be serialisable
 * because it is replayed on the retry.
 */
export async function postJson(url: string, body?: unknown): Promise<Response> {
  const send = (token: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      credentials: "include",
      // Never let a state-changing request sit in any HTTP cache.
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const response = await send(await getCsrfToken());
  if (!(await isCsrfFailure(response))) return response;

  return send(await getCsrfToken(true));
}
