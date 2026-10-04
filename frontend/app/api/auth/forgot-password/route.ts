import { NextResponse } from "next/server";

/**
 * Endpoint contract for password reset requests.
 *
 * A **seam**, not a final implementation. When a real auth service is
 * available, replace the body of this handler; the shape below is the contract
 * `components/auth/ForgotPasswordForm.tsx` talks to.
 *
 * Expected request:  { email: string }
 * Expected success:  { message: string }  → 200 (always, even for unknown
 *                    addresses, so the endpoint never leaks which emails exist)
 * Expected errors:   { error: { code, message } } → 422/429
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "Invalid request body." } }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json(
      { error: { code: "missing_fields", message: "Email is required." } },
      { status: 422 },
    );
  }

  // TODO: generate a short-lived reset token, email the link, and always reply
  // 200 regardless of whether the address exists (anti-enumeration).
  return NextResponse.json(
    {
      error: {
        code: "not_configured",
        message: "Password reset is not connected yet.",
      },
    },
    { status: 501 },
  );
}