import type { NextConfig } from "next";

/**
 * The API the browser never sees.
 *
 * Only the Next.js server talks to this. The browser keeps using
 * `http://localhost:3000/api/...`, which is what keeps the OAuth session and
 * CSRF cookies first-party — a cross-origin call to `:3010` would need
 * `SameSite=None; Secure` and credentialed CORS, both of which this design
 * avoids entirely.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3010";

/**
 * Whether `/api/*` is served by NestJS.
 *
 * Off by default, and that is deliberate rather than cautious. The app/api route
 * handlers are still present and fully working; flipping this on routes every
 * `/api` path to the new service in one step, which is not something to do
 * before the two have been compared route by route.
 *
 * When it is off, `proxy.ts` keeps adding the dev CORS headers those handlers
 * still expect. When it is on, that behaviour is off too — the rewrite is
 * same-origin, so there is no cross-origin request to accommodate.
 */
const apiRewriteEnabled = process.env.API_REWRITE_ENABLED === "true";

const nextConfig: NextConfig = {
  /* The rewrite is proxied by Next's own http client, which gives up after 30s
     and surfaces the aborted socket to the browser as a 500 — while NestJS,
     still running the same request, logs nothing. `/assess` measures ~49s end to
     end (Foundry 404s, so the model deployment generates a full markdown
     assessment), which lands past that window and fails onboarding at the final
     step. Sized to the slowest call we make, not to a guess. */
  experimental: {
    proxyTimeout: 180_000,
  },
  /* The canonical brand logo is served from the marketing site — the same asset
     v1.0 used — so `next/image` needs that host allow-listed. */
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.stratvedatech.com" }],
  },
  async rewrites() {
    return {
      beforeFiles: [
        /* The onboarding interview is served by NestJS unconditionally, ahead of
         * the blanket flag below. Its question generation calls the Foundry
         * agent endpoint and reads the uploaded reports from the shared
         * database, both of which live only in the API service; leaving these
         * two routes on the app/api handlers would serve a strictly thinner
         * interview. Scoping the rewrite to this prefix — rather than flipping
         * `API_REWRITE_ENABLED` — keeps every other route on the handlers until
         * the two implementations have been compared route by route.
         *
         * `beforeFiles`, for the reason above: the array shorthand is checked
         * after the filesystem, so the app/api route handlers would win and the
         * rewrite would silently never fire. Same-origin, so the session and
         * CSRF cookies cross unchanged. */
        {
          source: "/api/agent/onboarding/:path*",
          destination: `${API_INTERNAL_URL}/api/agent/onboarding/:path*`,
        },
        ...(apiRewriteEnabled
          ? [
              {
                source: "/api/:path*",
                destination: `${API_INTERNAL_URL}/api/:path*`,
              },
            ]
          : []),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
