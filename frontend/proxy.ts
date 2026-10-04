import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Development-only API enablement.
 *
 * In `next dev` the API accepts cross-origin calls (preflight + CORS headers)
 * so a separate dev frontend or local client can exercise the routes — handy
 * for testing the backend while the marketing site is static. In production the
 * same-origin app is the only consumer, so no CORS headers are added and the
 * CSRF cookie stays Strict.
 */

const DEV_METHODS = "GET, POST, OPTIONS";
const DEV_ALLOW_HEADERS = "Content-Type, X-CSRF-Token";

function corsHeaders(request: NextRequest): Headers {
  const origin = request.headers.get("origin") ?? "";
  return new Headers({
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": origin ? "true" : "false",
    "Access-Control-Allow-Methods": DEV_METHODS,
    "Access-Control-Allow-Headers": DEV_ALLOW_HEADERS,
    Vary: "Origin",
  });
}

/**
 * Once `/api/*` is rewritten to the standalone service, this has nothing to do.
 *
 * The rewrite is same-origin: the browser asks `:3000` and Next forwards to the
 * API, so there is no cross-origin request needing a preflight answered here.
 * Adding `Access-Control-Allow-Origin: *` to a response that never crosses an
 * origin is at best noise and at worst talks a strict browser into a request it
 * did not need to make. See `API_REWRITE_ENABLED` in `next.config.ts`.
 */
const apiRewriteEnabled = process.env.API_REWRITE_ENABLED === "true";

export function proxy(request: NextRequest) {
  if (apiRewriteEnabled) return NextResponse.next();
  if (process.env.NODE_ENV !== "development") return NextResponse.next();

  // Cross-origin preflight from browsers — answer it directly.
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
  }

  const response = NextResponse.next();
  corsHeaders(request).forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};