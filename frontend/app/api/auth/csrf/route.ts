import { NextResponse } from "next/server";

import {
  CSRF_COOKIE,
  csrfCookieOptions,
  generateCsrfToken,
} from "@/lib/auth/csrf";

/**
 * Issues a fresh CSRF token.
 *
 * Sets it in the `revops_csrf` cookie (readable by client JS) and returns it in
 * the body so forms can echo it back in the `X-CSRF-Token` header.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const token = generateCsrfToken();
  const res = NextResponse.json({ csrfToken: token });
  res.cookies.set(CSRF_COOKIE, token, csrfCookieOptions());
  return res;
}