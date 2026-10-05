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

export type ProfileUpdateInput = {
  name: string;
};

export type ProfileUpdateResult =
  | { ok: true; data: ProfileUpdateInput }
  | { ok: false; fields: Partial<Record<"name", string>> };

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  /** Checked here so a mismatch never reaches the database. */
  confirmPassword: string;
};

export type PasswordChangeResult =
  | { ok: true; data: PasswordChangeInput }
  | {
      ok: false;
      fields: Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pulls a string field out of an untrusted JSON body, or undefined. */
function readField(raw: unknown, field: string): unknown {
  return typeof raw === "object" && raw !== null && field in raw
    ? (raw as Record<string, unknown>)[field]
    : undefined;
}

/**
 * Server-side validation for a profile name change.
 *
 * The same length bounds as signup, so a name saved here can never be one that
 * signup would have rejected — otherwise the two paths would disagree about what
 * a valid name is.
 */
export function validateProfileUpdate(raw: unknown): ProfileUpdateResult {
  const fields: Partial<Record<"name", string>> = {};

  const name = readField(raw, "name");

  if (typeof name !== "string" || name.trim().length < 2) {
    fields.name = "Name must be at least 2 characters.";
  } else if (name.trim().length > 80) {
    fields.name = "Name must be 80 characters or fewer.";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return { ok: true, data: { name: (name as string).trim() } };
}

/**
 * Server-side validation for a password change.
 *
 * The same 8–128 character policy signup applies, so a user cannot sign up
 * under one rule and then set a password the sign-in form would later refuse.
 * The confirmation is compared here rather than in the client: it is the last
 * point where a typo is still recoverable, and a client-side-only check would
 * let a direct request set a password the user never typed twice.
 */
export function validatePasswordChange(raw: unknown): PasswordChangeResult {
  const fields: Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>> = {};

  const currentPassword = readField(raw, "currentPassword");
  const newPassword = readField(raw, "newPassword");
  const confirmPassword = readField(raw, "confirmPassword");

  if (typeof currentPassword !== "string" || currentPassword === "") {
    fields.currentPassword = "Current password is required.";
  } else if (currentPassword.length > 128) {
    fields.currentPassword = "Current password must be 128 characters or fewer.";
  }

  if (typeof newPassword !== "string" || newPassword === "") {
    fields.newPassword = "Password is required.";
  } else if (newPassword.length < 8) {
    fields.newPassword = "Password must be at least 8 characters.";
  } else if (newPassword.length > 128) {
    fields.newPassword = "Password must be 128 characters or fewer.";
  }

  /* Only worth comparing once both halves are real strings, otherwise a missing
     field reports two errors for one mistake. */
  if (
    typeof newPassword === "string" &&
    typeof confirmPassword === "string" &&
    newPassword !== confirmPassword
  ) {
    fields.confirmPassword = "Passwords do not match.";
  } else if (typeof confirmPassword !== "string" || confirmPassword === "") {
    fields.confirmPassword = "Confirm your new password.";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    data: {
      currentPassword: currentPassword as string,
      newPassword: newPassword as string,
      confirmPassword: confirmPassword as string,
    },
  };
}

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