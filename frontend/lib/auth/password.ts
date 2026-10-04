import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

/**
 * Password hashing built on Node's built-in scrypt (no native deps).
 *
 * Stored form: `scrypt$<salt hex>$<hash hex>`. The same-coded `verifyPassword`
 * is the only consumer, so the salt scheme is carried inside the string.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time check of a plaintext password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Trim + lowercase. Email lookups are always done on the normalized form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}