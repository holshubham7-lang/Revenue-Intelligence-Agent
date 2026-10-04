/**
 * Nominal type for AES-256-GCM envelopes produced by `lib/security/crypto`.
 *
 * A distinct type so a ciphertext envelope cannot be assigned to a plain
 * `string` field by accident, and so `grep Encrypted` enumerates every place a
 * secret or customer-derived value is stored. Plaintext and ciphertext are both
 * `string` at runtime, so this is a compile-time guard only — it cannot stop a
 * caller from calling `encrypt()` twice and writing the envelope to the wrong
 * field. Decryption stays explicit at every read site.
 */
export type Encrypted = string & { readonly __encrypted: unique symbol };
