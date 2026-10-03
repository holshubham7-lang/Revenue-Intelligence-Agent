import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import type { MongoServerError } from "mongodb";

import { csrfPasses } from "@/lib/auth/csrf";
import { hashPassword } from "@/lib/auth/password";
import { validateSignup } from "@/lib/auth/validation";
import type { UserDoc } from "@/lib/auth/user";
import { getDb } from "@/lib/db";

/**
 * Account creation with server-side validation.
 *
 * Validates each field, hashes the password with scrypt, and stores the user in
 * the `revops` database `users` collection. The unique index on `email` is the
 * final guard against duplicates; the 409 path stays race-free.
 *
 * Request:  { name, email, password }
 * Success:  201 { user: { id, name, email } }   (never returns the password)
 * Errors:   400 invalid_json · 422 validation/missing · 409 email_exists · 500
 */
export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return NextResponse.json(
      { error: { code: "csrf_failed", message: "Session token missing or invalid. Refresh the page and try again." } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Invalid request body." } },
      { status: 400 },
    );
  }

  const result = validateSignup(body);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Please fix the highlighted fields.",
          fields: result.fields,
        },
      },
      { status: 422 },
    );
  }

  const { name, email, password } = result.data;
  const now = new Date().toISOString();

  const id = new ObjectId().toHexString();
  const doc = {
    _id: id,
    name,
    email,
    passwordHash: hashPassword(password),
    authProvider: "password",
    isEmailVerified: false,
    isBlocked: false,
    isTestAccount: false,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const db = await getDb();
    await db.collection<UserDoc>("users").insertOne(doc);
  } catch (err) {
    const code = (err as MongoServerError).code;
    if (code === 11000) {
      return NextResponse.json(
        { error: { code: "email_exists", message: "An account with this email already exists." } },
        { status: 409 },
      );
    }
    console.error("signup: failed to insert user", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Couldn't create your account right now. Please try again in a moment." } },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { user: { id, name, email } },
    { status: 201 },
  );
}