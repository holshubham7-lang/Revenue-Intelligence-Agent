import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Relative, not `@/lib/...`: this keeps `crypto.ts` free of runtime-resolved
// aliases so it can be exercised directly by `node lib/security/crypto.ts`.
import type { Encrypted } from "./encrypted.ts";

/**
 * Authenticated encryption for data at rest (AES-256-GCM).
 *
 * Anything secret or customer-derived that leaves the request scope — CRM
 * access/refresh tokens, uploaded file bytes, profile metrics — is stored as
 * `v1.<iv>.<tag>.<ciphertext>`, all base64url. GCM is authenticated, so a
 * tampered or truncated value fails to decrypt rather than silently decoding to
 * garbage; `decrypt` throws `decrypt_failed` in that case and callers must
 * treat the record as unusable, not as empty.
 *
 * `aad` binds a ciphertext to the record that owns it. Decrypting a token with
 * a different record's id as AAD fails, so ciphertext cannot be copied from
 * one document to another and still open — the usual way a tenant-bound secret
 * turns into a cross-tenant leak.
 *
 * Key handling:
 *   DATA_ENCRYPTION_KEY  base64url or hex of exactly 32 bytes
 *                        (generate with `generateDataKey()`)
 *
 * A missing or malformed key is a hard failure at first use, never a silent
 * fallback to plaintext. Rotation is `keyId`-prefixed envelopes, which this
 * version does not yet emit: until a `v2` envelope exists, rotating the key
 * requires re-encrypting existing records in one maintenance pass.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce — the size GCM is specified for
const TAG_BYTES = 16;
const ENVELOPE_VERSION = "v1";
const ENVELOPE_PARTS = 4;

let cachedKey: Buffer | null = null;

export class DecryptError extends Error {
  constructor() {
    super("decrypt_failed");
    this.name = "DecryptError";
  }
}

function decodeKeyMaterial(value: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) return Buffer.from(value, "base64url");
  return null;
}

/**
 * Loads and validates `DATA_ENCRYPTION_KEY`, caching the derived key for the
 * process. Throws rather than returning a default so a misconfigured
 * deployment fails loudly instead of writing readable secrets.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;

  const value = process.env.DATA_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("DATA_ENCRYPTION_KEY is not set. Add it to .env.local (see generateDataKey).");
  }

  const decoded = decodeKeyMaterial(value);
  if (!decoded || decoded.length !== KEY_BYTES) {
    throw new Error(
      "DATA_ENCRYPTION_KEY must decode to exactly 32 bytes as hex (64 chars) or base64url (43 chars).",
    );
  }

  cachedKey = decoded;
  return cachedKey;
}

/** Generates a fresh 32-byte key in the hex form `DATA_ENCRYPTION_KEY` expects. */
export function generateDataKey(): string {
  return randomBytes(KEY_BYTES).toString("hex");
}

/**
 * Encrypts `plaintext`, returning a `v1.<iv>.<tag>.<ciphertext>` envelope.
 *
 * `aad` is optional but should always be the owning record's identity
 * (`data_sources:<id>`) — omitting it forfeits the tenant-binding guarantee.
 */
export function encrypt(plaintext: string | Buffer, aad?: string): Encrypted {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

  const body =
    typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : Buffer.from(plaintext);
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".") as Encrypted;
}

/**
 * Decrypts an envelope produced by `encrypt`.
 *
 * Throws `DecryptError` when the envelope is malformed, the key is wrong, the
 * AAD does not match, or the ciphertext was tampered with. GCM cannot tell
 * those cases apart, and callers should not try: all of them mean the stored
 * value is untrustworthy.
 */
export function decrypt(envelope: string, aad?: string): Buffer {
  if (typeof envelope !== "string") throw new DecryptError();

  const parts = envelope.split(".");
  if (parts.length !== ENVELOPE_PARTS || parts[0] !== ENVELOPE_VERSION) throw new DecryptError();

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const body = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new DecryptError();

    const decipher = createDecipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch (err) {
    if (err instanceof DecryptError) throw err;
    throw new DecryptError();
  }
}

/** Decrypts to a UTF-8 string. Use for token columns; use `decrypt` for bytes. */
export function decryptString(envelope: string, aad?: string): string {
  return decrypt(envelope, aad).toString("utf8");
}

/**
 * HMAC-SHA256 hex digest, for lookups that must match a value without being
 * able to decrypt it (e.g. finding a `source_files` row by `sha256`).
 */
export function keyedDigest(value: string): string {
  return createHmac("sha256", key()).update(value).digest("hex");
}

/** Clears the cached key. Test-only; production never rotates mid-process. */
export function resetKeyCache(): void {
  cachedKey = null;
}
