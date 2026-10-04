import { normalizeEmail } from "@/lib/auth/password";

export type SignupInput = {
  name: string;
  email: string;
  password: string;
};

export type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;

export type ValidationResult =
  | { ok: true; data: SignupInput }
  | { ok: false; fields: FieldErrors };

export type SigninInput = {
  email: string;
  password: string;
};

export type SigninResult =
  | { ok: true; data: SigninInput }
  | { ok: false; fields: Partial<Record<"email" | "password", string>> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server-side validation for password account creation.
 *
 * Every field is checked for type and content and the error message is
 * field-specific so the client can surface it at the input if it wants to.
 * The body arrives as JSON, so values can be any type — reject anything that
 * is not the string shape we expect instead of coercing.
 */
export function validateSignup(raw: unknown): ValidationResult {
  const fields: FieldErrors = {};

  const name = typeof raw === "object" && raw !== null && "name" in raw ? raw.name : undefined;
  const email = typeof raw === "object" && raw !== null && "email" in raw ? raw.email : undefined;
  const password =
    typeof raw === "object" && raw !== null && "password" in raw ? raw.password : undefined;

  if (typeof name !== "string" || name.trim().length < 2) {
    fields.name = "Name must be at least 2 characters.";
  } else if (name.trim().length > 80) {
    fields.name = "Name must be 80 characters or fewer.";
  }

  if (typeof email !== "string" || email.trim() === "") {
    fields.email = "Email is required.";
  } else if (!EMAIL_RE.test(email.trim())) {
    fields.email = "Enter a valid email address.";
  } else if (email.trim().length > 254) {
    fields.email = "Email must be 254 characters or fewer.";
  }

  if (typeof password !== "string" || password === "") {
    fields.password = "Password is required.";
  } else if (password.length < 8) {
    fields.password = "Password must be at least 8 characters.";
  } else if (password.length > 128) {
    fields.password = "Password must be 128 characters or fewer.";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  // Safe to cast: any non-string value for any field above set a field error
  // and returned early, so all three are known strings here.
  const nameStr = name as string;
  const emailStr = email as string;
  const passwordStr = password as string;

  return {
    ok: true,
    data: {
      name: nameStr.trim(),
      email: normalizeEmail(emailStr),
      password: passwordStr, // never logged, hashed immediately by the route
    },
  };
}

/**
 * Server-side validation for password sign-in. Same stance as signup: reject
 * anything that is not the expected string shape. No minimum length on the
 * password — existing accounts may predate the 8-character policy.
 */
export function validateSignin(raw: unknown): SigninResult {
  const fields: Partial<Record<"email" | "password", string>> = {};

  const email = typeof raw === "object" && raw !== null && "email" in raw ? raw.email : undefined;
  const password =
    typeof raw === "object" && raw !== null && "password" in raw ? raw.password : undefined;

  if (typeof email !== "string" || email.trim() === "") {
    fields.email = "Email is required.";
  } else if (!EMAIL_RE.test(email.trim())) {
    fields.email = "Enter a valid email address.";
  } else if (email.trim().length > 254) {
    fields.email = "Email must be 254 characters or fewer.";
  }

  if (typeof password !== "string" || password === "") {
    fields.password = "Password is required.";
  } else if (password.length > 128) {
    fields.password = "Password must be 128 characters or fewer.";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  // Safe cast: non-string values for any field were rejected above.
  return {
    ok: true,
    data: {
      email: normalizeEmail(email as string),
      password: password as string,
    },
  };
}