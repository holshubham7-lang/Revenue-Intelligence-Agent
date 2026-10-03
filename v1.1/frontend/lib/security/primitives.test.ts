/**
 * Runtime checks for the security primitives. Run with:
 *   node --test lib/security/primitives.test.ts
 *
 * These exist because the failure modes here are silent. A redaction regex that
 * stops matching, or an envelope that decrypts to garbage instead of throwing,
 * both look like success from the outside while leaking or corrupting data.
 *
 * `crypto.ts`, `redact.ts`, and `uploads.ts` are deliberately free of
 * runtime-resolved path aliases so this file can import them directly.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { decryptString, encrypt, generateDataKey, DecryptError } from "./crypto.ts";
import { redact } from "./redact.ts";
import { validateUpload, extensionOf, MAX_UPLOAD_BYTES } from "../data/uploads.ts";

process.env.DATA_ENCRYPTION_KEY = generateDataKey();

test("encrypt/decrypt round-trips", () => {
  const secret = "hubspot-refresh-token-abc123";
  const envelope = encrypt(secret);
  assert.match(envelope, /^v1\./);
  assert.notEqual(envelope, secret, "ciphertext must not contain plaintext");
  assert.equal(decryptString(envelope), secret);
});

test("ciphertext differs each time (random IV)", () => {
  const a = encrypt("same-value");
  const b = encrypt("same-value");
  assert.notEqual(a, b);
  assert.equal(decryptString(a), decryptString(b));
});

test("AAD binds ciphertext to its record", () => {
  const envelope = encrypt("token", "data_sources:abc");
  assert.equal(decryptString(envelope, "data_sources:abc"), "token");
  assert.throws(() => decryptString(envelope, "data_sources:xyz"), DecryptError);
  assert.throws(() => decryptString(envelope), DecryptError);
});

test("tampered ciphertext is rejected, not silently decoded", () => {
  const envelope = encrypt("sensitive-value");
  const parts = envelope.split(".");
  const body = Buffer.from(parts[3], "base64url");
  body[0] ^= 0xff;
  parts[3] = body.toString("base64url");
  assert.throws(() => decryptString(parts.join(".")), DecryptError);
});

test("garbage envelopes are rejected", () => {
  for (const bad of ["", "nope", "v1.a.b", "v2.a.b.c.d", "v1.a.b.c.d.e"]) {
    assert.throws(() => decryptString(bad), DecryptError, `expected throw for ${bad}`);
  }
});

test("redact strips emails, currency, and literal entity names", () => {
  const text =
    'Deal "Northwind Expansion" ($480,000) is owned by jane.doe@acme.com; 22% of the pipeline is stale.';
  const result = redact(text, { literals: ["Northwind Expansion"] });

  assert.ok(!result.text.includes("jane.doe@acme.com"), "email must go");
  assert.ok(!result.text.includes("480,000"), "currency must go");
  assert.ok(!result.text.includes("Northwind"), "literal entity name must go");
  assert.ok(result.text.includes("22%"), "percentages are the insight — must survive");
  // 44 of 106 characters were identifying, so this chunk is correctly dropped.
  assert.equal(result.clean, false);
  assert.ok(result.removedChars > 0);
});

test("density is length-independent: same redactions, longer passage survives", () => {
  const identifiers =
    'Deal "Northwind Expansion" ($480,000) is owned by jane.doe@acme.com.';
  const padding =
    " Conversion from discovery to proposal has slipped two quarters running, " +
    "and the average deal cycle length is now well beyond the target the team " +
    "set at the start of the fiscal year. Win rates on late-stage opportunities " +
    "remain healthy, which suggests the issue is entry quality rather than " +
    "positioning. The pattern is consistent across both segments. ";
  const result = redact(padding + identifiers + padding, {
    literals: ["Northwind Expansion"],
  });

  assert.equal(result.redactions, 3);
  assert.equal(result.clean, true, "a long analytical passage must still be indexable");
  assert.ok(!result.text.includes("Northwind"));
  assert.ok(result.text.includes("Conversion from discovery"));
});

test("redact keeps relative but drops absolute amounts in both orderings", () => {
  const codeFirst = redact("Pipeline grew 40% to USD 1,250,000.");
  assert.ok(codeFirst.text.includes("40%"));
  assert.ok(!codeFirst.text.includes("1,250,000"), "code-first currency must be caught");

  const symbolFirst = redact("Pipeline grew 40% to €980,000.");
  assert.ok(symbolFirst.text.includes("40%"));
  assert.ok(!symbolFirst.text.includes("980,000"), "symbol-first currency must be caught");

  const symbolFirstCode = redact("Total is $4.2M of new business.");
  assert.ok(!symbolFirstCode.text.includes("4.2"), "symbol + compact decimal must be caught");
});

test("redact keeps a date range that looks like a phone number", () => {
  // Digits, hyphens, and spaces in phone-like lengths. Redacting this would strip
  // the time context that makes a staleness claim true.
  const result = redact("The export spans 2024-10-05 to 2025-01-10 with 3 deals open.");

  assert.ok(result.text.includes("2024-10-05"), "the start date survives");
  assert.ok(result.text.includes("2025-01-10"), "the end date survives");
  assert.ok(!result.categories.includes("phone"), "and it is not counted as a phone redaction");
});

test("redact keeps a single ISO date that looks like a phone number", () => {
  const result = redact("Close date 2025-01-10 is well before the renewal.");
  assert.ok(result.text.includes("2025-01-10"));
});

test("redact still removes a real phone number beside dates", () => {
  // The exemption is scoped to matches containing a date; it must not disable the
  // phone rule generally.
  const result = redact("Close date 2025-01-10. Call +44 20 7946 0958 for the account owner.");

  assert.ok(result.text.includes("2025-01-10"), "the date is still kept");
  assert.ok(!result.text.includes("7946 0958"), "the phone number is still redacted");
});

test("redact still removes a bare long digit run", () => {
  const result = redact("Account 123456789 was in the pipeline.");
  assert.ok(!result.text.includes("123456789"));
});

test("a heavily identifying chunk is marked unclean, not stored", () => {
  const text =
    "a@b.com c@d.com e@f.com 111-222-3333 444-555-6666 777-888-9999 $10,000 $20,000 $30,000 $40,000";
  const result = redact(text);
  assert.equal(result.clean, false, "density check must reject this");
});

test("longest literal wins so no fragment is left dangling", () => {
  const result = redact("The Northwind account is at risk.", {
    literals: ["Northwind", "Northwind Expansion"],
  });
  assert.ok(!result.text.includes(" Expansion"), "must not leave a fragment behind");
});

test("upload allowlist rejects executables regardless of extension", () => {
  const pe = Buffer.concat([
    Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
    Buffer.alloc(64, 0x00),
  ]);
  const r = validateUpload("totally-safe.csv", pe);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "executable_signature");
});

test("upload allowlist rejects macro-enabled and unknown extensions", () => {
  assert.equal(extensionOf("book.xlsm"), null);
  assert.equal(extensionOf("payload.exe"), null);
  assert.equal(extensionOf("notes.pdf"), null, "PDF deferred in v1");
  assert.equal(extensionOf("noextension"), null);
});

test("csv must be text, not a renamed binary", () => {
  const binary = Buffer.concat([
    Buffer.from("deal,amount,stage\nNorthwind,480000,Negotiation\n"),
    Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0x05]),
    Buffer.alloc(64, 0x00),
  ]);
  const r = validateUpload("deals.csv", binary);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "signature_mismatch");
});

test("a real csv is accepted and hashed in full", () => {
  const csv = Buffer.from(
    "deal,amount,stage\nNorthwind,480000,Negotiation\nAcme,120000,Closed Won\n",
    "utf8",
  );
  const r = validateUpload("deals.csv", csv);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.extension, "csv");
  assert.equal(r.sizeBytes, csv.length);
  assert.match(r.sha256, /^[0-9a-f]{64}$/);
  assert.equal(r.sha256.length, 64);
});

test("xlsx must be a real workbook container", () => {
  const fakeZip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(128, 0x20),
  ]);
  const r = validateUpload("book.xlsx", fakeZip);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "signature_mismatch");
});

test("a real xlsx container is accepted", () => {
  const zip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("[Content_Types].xml"),
    Buffer.from("xl/workbook.xml"),
    Buffer.from("xl/worksheets/sheet1.xml"),
  ]);
  const r = validateUpload("deals.xlsx", zip);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.extension, "xlsx");
  assert.match(r.mimeType, /spreadsheetml\.sheet$/);
});

test("macro-enabled workbooks are refused even though they are valid zips", () => {
  const macro = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("xl/workbook.xml"),
    Buffer.from("xl/vbaProject.bin"),
  ]);
  const r = validateUpload("book.xlsx", macro);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "macro_enabled");
});

test("oversized uploads are refused before any parsing", () => {
  const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41);
  const r = validateUpload("big.csv", big);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "too_large");
});
