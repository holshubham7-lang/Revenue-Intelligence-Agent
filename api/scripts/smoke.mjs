/**
 * Live smoke test against a running API.
 *
 * Not part of the unit suite: it needs a booted service and, for the provider
 * cases, dummy credentials. Run the service, then:
 *   node scripts/smoke.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3010";

/**
 * The OAuth state cookie's real name.
 *
 * Read from the source rather than hardcoded, so a rename in `oauth.ts` fails
 * these checks loudly instead of silently skipping them — a wrong name here
 * makes every state assertion pass vacuously. It is a `process.env`-dependent
 * ternary, so the development branch is what gets matched.
 */
const cookieCookieName = () => {
  const source = readFileSync(new URL("../src/auth/oauth.ts", import.meta.url), "utf8");
  const statement = source.match(/OAUTH_STATE_COOKIE\s*=[^;]+;/s)?.[0];
  if (!statement) throw new Error("could not find OAUTH_STATE_COOKIE in src/auth/oauth.ts");
  const literals = [...statement.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (literals.length < 2) throw new Error(`unexpected OAUTH_STATE_COOKIE shape: ${statement}`);
  return literals[literals.length - 1];
};

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`smoke: ${base}\n`);

  /* Health ---------------------------------------------------------------- */
  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json();
  check("GET /api/health is 200", health.status === 200, `got ${health.status}`);
  check("health reports the browser origin", healthBody.origin === "http://localhost:3000", healthBody.origin);
  check("health leaks no secrets", !JSON.stringify(healthBody).match(/secret|id\.apps/i));

  /* CSRF ------------------------------------------------------------------ */
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const csrfBody = await csrfRes.json();
  const setCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const csrfCookie = setCookies.find((c) => c.startsWith("revops_csrf="));
  check("GET /api/auth/csrf is 200", csrfRes.status === 200, `got ${csrfRes.status}`);
  check("csrf returns a token", typeof csrfBody.csrfToken === "string" && csrfBody.csrfToken.length === 64);
  check("csrf cookie is SameSite=Strict", csrfCookie?.includes("SameSite=Strict"), csrfCookie);
  check("csrf cookie is NOT HttpOnly", !csrfCookie?.includes("HttpOnly"), csrfCookie);
  /* Cookie lifetimes are declared in seconds in the shared option objects while
     `res.cookie` reads `maxAge` as milliseconds. Getting that wrong yields
     `Max-Age=0` — an already-expired cookie — which silently broke the OAuth
     state cookie and every social sign-in. Assert the real value. */
  check("csrf cookie lives for an hour, not 0", /Max-Age=3600/.test(csrfCookie), csrfCookie);
  check("csrf cookie expires in the future", new Date(csrfCookie.match(/Expires=([^;]+)/)[1]) > new Date(), csrfCookie);

  /* Double-submit means the cookie must come back WITH the header. A browser
     sends both; sending only the header is a 403 by design. */
  const token = csrfCookie.split(";")[0].split("=")[1];
  const csrfHeaders = { "content-type": "application/json", "x-csrf-token": token, cookie: `revops_csrf=${token}` };

  /* CSRF is enforced ------------------------------------------------------ */
  const noCsrf = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "x".repeat(12) }),
  });
  const noCsrfBody = await noCsrf.json();
  check("signin without CSRF is 403", noCsrf.status === 403, `got ${noCsrf.status}`);
  check("csrf failure uses the shared envelope", noCsrfBody.error?.code === "csrf_failed", JSON.stringify(noCsrfBody));

  const wrongCsrf = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": "wrong", cookie: `revops_csrf=${token}` },
    body: JSON.stringify({ email: "a@b.com", password: "x".repeat(12) }),
  });
  check("signin with a mismatched CSRF pair is 403", wrongCsrf.status === 403, `got ${wrongCsrf.status}`);

  /* Validation ------------------------------------------------------------ */
  const invalid = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: csrfHeaders,
    body: JSON.stringify({ name: "", email: "nope", password: "short" }),
  });
  const invalidBody = await invalid.json();
  check("invalid signup is 422", invalid.status === 422, `got ${invalid.status}`);
  check("422 carries per-field errors", typeof invalidBody.error?.fields?.email === "string", JSON.stringify(invalidBody.error));

  /* Malformed JSON -------------------------------------------------------- */
  const malformed = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: csrfHeaders,
    body: "{not json",
  });
  const malformedBody = await malformed.json();
  check("malformed JSON is 400", malformed.status === 400, `got ${malformed.status}`);
  check("400 uses invalid_json, not a parser message", malformedBody.error?.code === "invalid_json", JSON.stringify(malformedBody));

  /* Unknown provider ------------------------------------------------------ */
  const unknown = await fetch(`${base}/api/auth/oauth/myspace`);
  const unknownBody = await unknown.json();
  check("unknown provider is 404", unknown.status === 404, `got ${unknown.status}`);
  check("404 names the provider problem", unknownBody.error?.code === "unknown_provider", JSON.stringify(unknownBody));

  /* OAuth start ----------------------------------------------------------- */  /* Reaching the provider needs credentials; without them the route correctly
     bounces to /signin?error=not_configured, which is what the checks just
     above assert. With dummy credentials the state machine is reachable, so the
     two branches are decided by where the redirect actually points. */
  const start = await fetch(`${base}/api/auth/oauth/google`, { redirect: "manual" });
  const startLocation = start.headers.get("location");
  if (startLocation?.startsWith("https://accounts.google.com")) {
    const provider = new URL(startLocation);
    check("configured provider redirects to the provider, not the frontend", provider.origin === "https://accounts.google.com", provider.origin);
    check("authorize URL carries the callback on the frontend origin", provider.searchParams.get("redirect_uri") === "http://localhost:3000/api/auth/oauth/google/callback", provider.searchParams.get("redirect_uri") ?? "none");
    check("authorize URL uses S256, not plain", provider.searchParams.get("code_challenge_method") === "S256");
    check("authorize URL asks only for OIDC scopes", provider.searchParams.get("scope") === "openid email profile", provider.searchParams.get("scope"));
    check("authorize URL never leaks the client secret", !startLocation.includes("dummy-google-secret"));
    const stateCookie = (start.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${cookieCookieName()}=`) && c.includes("Max-Age=600"));
    check("start sets a Lax HttpOnly state cookie", Boolean(stateCookie) && stateCookie.includes("SameSite=Lax"), stateCookie ?? JSON.stringify(start.headers.getSetCookie?.() ?? []));
    check("state cookie is not born expired", Boolean(stateCookie) && /Expires=[^;]+/.test(stateCookie) && new Date(stateCookie.match(/Expires=([^;]+)/)[1]) > new Date(), stateCookie ?? "none");
    const state = provider.searchParams.get("state");
    const cookieValue = stateCookie.split(";")[0].split("=").slice(1).join("=");

    /* Callback with a forged state ---------------------------------------- */
    const forgedState = await fetch(`${base}/api/auth/oauth/google/callback?code=abc&state=not-the-real-one`, {
      redirect: "manual",
      headers: { cookie: `${cookieCookieName()}=${cookieValue}` },
    });
    const forgedUrl = new URL(forgedState.headers.get("location"));
    check("callback with a forged state fails closed", forgedUrl.searchParams.get("error") === "state_mismatch", forgedUrl.search);
    const forgedCookies = forgedState.headers.getSetCookie?.() ?? [];
    check("failed callback clears the state cookie", forgedCookies.some((c) => c.startsWith(`${cookieCookieName()}=;`) && c.includes("Max-Age=0")), JSON.stringify(forgedCookies));
    check("failed callback leaves an actionable message", forgedCookies.some((c) => c.startsWith("revops_oauth_error=")));

    /* Callback with no state cookie at all -------------------------------- */
    const noState = await fetch(`${base}/api/auth/oauth/google/callback?code=abc&state=${encodeURIComponent(state)}`, {
      redirect: "manual",
    });
    check("callback without the state cookie fails closed", new URL(noState.headers.get("location")).searchParams.get("error") === "state_mismatch");

    /* Nested state param must be treated as absent ------------------------- */
    /* Next's searchParams.get("state") returned null for `?state[a]=x`; Express
       parses it into an object. This asserts the API treats it as absent rather
       than coercing it into a string. */
    const nested = await fetch(`${base}/api/auth/oauth/google/callback?code=abc&state[ver]=forged`, {
      redirect: "manual",
      headers: { cookie: `${cookieCookieName()}=${cookieValue}` },
    });
    check("nested state param is rejected, not coerced", new URL(nested.headers.get("location")).searchParams.get("error") === "state_mismatch");

    /* Wrong provider for this transaction --------------------------------- */
    const wrongProvider = await fetch(`${base}/api/auth/oauth/microsoft/callback?code=abc&state=${encodeURIComponent(state)}`, {
      redirect: "manual",
      headers: { cookie: `${cookieCookieName()}=${cookieValue}` },
    });
    check("a transaction cannot be replayed against another provider", new URL(wrongProvider.headers.get("location")).searchParams.get("error") === "state_mismatch");

    /* No code at all ------------------------------------------------------ */
    const noCode = await fetch(`${base}/api/auth/oauth/google/callback?state=${encodeURIComponent(state)}`, {
      redirect: "manual",
      headers: { cookie: `${cookieCookieName()}=${cookieValue}` },
    });
    check("a callback with no code reports missing_code", new URL(noCode.headers.get("location")).searchParams.get("error") === "missing_code");

    /* Access denied ------------------------------------------------------- */
    const denied = await fetch(`${base}/api/auth/oauth/google/callback?error=access_denied`, {
      redirect: "manual",
      headers: { cookie: `${cookieCookieName()}=${cookieValue}` },
    });
    const deniedUrl = new URL(denied.headers.get("location"));
    check("access_denied is surfaced as itself", deniedUrl.searchParams.get("error") === "access_denied", deniedUrl.search);
    check("access_denied carries a provider-console hint", (deniedUrl.searchParams.get("hint") ?? "").length > 20);
  } else {
    /* No credentials: the guard must bounce to the frontend with a reason, and
       must never send the browser to a provider that would show `invalid_client`. */
    check("unconfigured provider redirects, never returns JSON", start.status === 302, `got ${start.status}`);
    check("failure redirects to the frontend, not the API", new URL(startLocation).origin === "http://localhost:3000", startLocation);
    check("failure names the reason", new URL(startLocation).searchParams.get("error") === "not_configured", startLocation);
    console.log("  SKIP  OAuth state machine (no provider credentials — set GOOGLE_CLIENT_ID/SECRET to run it)");
  }

  /* Protected route rejects anonymous ------------------------------------- */
  const anon = await fetch(`${base}/api/auth/signout`, { method: "POST", headers: csrfHeaders });
  const anonBody = await anon.json();
  check("signout with no session still clears cookies and 200s", anon.status === 200, `got ${anon.status}`);
  check("signout reports nothing was revoked", anonBody.revoked === false, JSON.stringify(anonBody));
  const signoutCookies = anon.headers.getSetCookie?.() ?? [];
  check("signout expires the session cookie", signoutCookies.some((c) => c.startsWith("revops_session=") && c.includes("Max-Age=0")), JSON.stringify(signoutCookies));

  /* Forged session cookie ------------------------------------------------- */
  const forged = await fetch(`${base}/api/auth/csrf`, { headers: { cookie: "revops_session=eyJzdWIiOiJoYWNrIiwic2lnIjoiZm9yZ2VkIn0=" } });
  check("a forged session cookie does not break health of other routes", forged.status === 200);

  /* 404 for an unrouted path uses the envelope ---------------------------- */
  const unrouted = await fetch(`${base}/api/nope`);
  const unroutedBody = await unrouted.json();
  check("unrouted path is a 404 in the shared envelope", unrouted.status === 404 && unroutedBody.error?.code === "not_found", JSON.stringify(unroutedBody));

  /* Helmet ---------------------------------------------------------------- */
  const helmetHeaders = health.headers;
  check("helmet sets a content security policy", helmetHeaders.has("content-security-policy"));

  console.log(failures === 0 ? "\nall smoke checks passed" : `\n${failures} smoke check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
