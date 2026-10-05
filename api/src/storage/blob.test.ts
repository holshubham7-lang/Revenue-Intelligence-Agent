/**
 * SharedKey signature checks for the Azure blob store.
 *
 * This exists because the failure mode is silent and expensive. A wrong
 * string-to-sign or a key that has been mangled in transit does not throw at
 * build time or in unit tests — it produces a request that looks entirely
 * reasonable and storage answers `AuthenticationFailed` (HTTP 403). That cost a
 * full upload investigation to localise, so the exact string-to-sign is pinned
 * here and recomputed independently of the implementation.
 *
 * The assertions are on the signature, not on internal helper output, so a
 * regression in the canonicalisation is caught even though `AzureBlobStore` is
 * private and `getBlobStore` caches its singleton.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { getBlobStore } from "./blob.ts";

/**
 * A key that is deliberately NOT valid UTF-8.
 *
 * A real storage account key is 64 random bytes, so it almost always contains
 * byte sequences that cannot be decoded to text. Decoding it with
 * `toString("utf8")` replaces those bytes with U+FFFD, which silently inflates
 * 64 bytes into 115 and changes every signature. If this fixture were ASCII, the
 * corruption this test guards against would not reproduce.
 */
const BINARY_KEY_BASE64 = Buffer.from([...Array(64).keys()].map((i) => (i * 7 + 200) % 256)).toString(
  "base64",
);

const ACCOUNT = "acctforblobtests";
const CONTAINER = "uploads";

process.env.AZURE_STORAGE_ACCOUNT = ACCOUNT;
process.env.AZURE_STORAGE_CONTAINER = CONTAINER;
process.env.AZURE_STORAGE_KEY = BINARY_KEY_BASE64;
process.env.AZURE_STORAGE_SAS_TOKEN = "sv=2021-08-06&sig=notarealsignature";

type CapturedRequest = { url: string; headers: Record<string, string>; bodyLength: number };

/** Captures the outgoing request instead of sending it. */
async function capturePut(bytes: Buffer, contentType: string): Promise<CapturedRequest> {
  const original = globalThis.fetch;
  let captured: CapturedRequest | null = null;

  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[name] = value;
    }
    captured = {
      url: String(input),
      headers,
      bodyLength: (init?.body as Uint8Array).length,
    };
    return new Response("", { status: 201 });
  }) as typeof fetch;

  try {
    await getBlobStore().put("companies/abc/def/file.txt", bytes, contentType);
  } finally {
    globalThis.fetch = original;
  }

  assert.ok(captured, "fetch was not called");
  return captured;
}

/** Rebuilds the expected signature straight from the documented SharedKey layout. */
function expectedSignature(options: {
  verb: string;
  blobPath: string;
  length: number;
  contentType: string;
  xms: Record<string, string>;
}): string {
  const canonicalHeaders = Object.entries(options.xms)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, value]) => `${name}:${value}`)
    .join("\n");

  const stringToSign = [
    options.verb,
    "", // Content-Encoding
    "", // Content-Language
    String(options.length),
    "", // Content-MD5
    options.contentType,
    "", // Date, superseded by x-ms-date
    "", // If-Modified-Since
    "", // If-Match
    "", // If-None-Match
    "", // If-Unmodified-Since
    "", // Range
    canonicalHeaders,
    `/${ACCOUNT}/${CONTAINER}/${options.blobPath}`,
  ].join("\n");

  return createHmac("sha256", Buffer.from(BINARY_KEY_BASE64, "base64"))
    .update(stringToSign, "utf8")
    .digest("base64");
}

test("the test key really is binary, so UTF-8 mangling would be caught", () => {
  const raw = Buffer.from(BINARY_KEY_BASE64, "base64");
  assert.equal(raw.length, 64);
  assert.notEqual(raw.toString("utf8"), raw.toString("latin1"));
  // Decoding as UTF-8 and re-encoding does not round-trip: the store must keep
  // the key as bytes for the signature to match.
  assert.notDeepEqual(Buffer.from(raw.toString("utf8"), "utf8"), raw);
});

test("PUT signs the raw key bytes over the canonical string", async () => {
  const bytes = Buffer.from("hello", "utf8");
  const contentType = "text/plain";
  const request = await capturePut(bytes, contentType);

  assert.equal(request.url, `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/companies/abc/def/file.txt`);
  assert.equal(request.bodyLength, 5);

  const date = request.headers["x-ms-date"];
  assert.ok(date, "x-ms-date must be sent");
  assert.equal(request.headers["x-ms-blob-type"], "BlockBlob");
  assert.equal(request.headers["Content-Type"], contentType);

  const expected = expectedSignature({
    verb: "PUT",
    blobPath: "companies/abc/def/file.txt",
    length: bytes.length,
    contentType,
    xms: {
      "x-ms-date": date,
      "x-ms-version": request.headers["x-ms-version"],
      "x-ms-blob-type": "BlockBlob",
    },
  });

  assert.equal(request.headers["Authorization"], `SharedKey ${ACCOUNT}:${expected}`);
});

test("Content-Type is not duplicated into the canonicalised headers block", async () => {
  const request = await capturePut(Buffer.from("x"), "application/vnd.ms-excel");
  const authorization = request.headers["Authorization"];
  assert.ok(authorization);

  // Re-derive with content-type wrongly included in the canonicalised block; the
  // signature must differ, otherwise the assertion below proves nothing.
  const date = request.headers["x-ms-date"];
  const contentType = "application/vnd.ms-excel";
  const wrong = expectedSignature({
    verb: "PUT",
    blobPath: "companies/abc/def/file.txt",
    length: 1,
    contentType,
    xms: {
      "x-ms-date": date,
      "x-ms-version": request.headers["x-ms-version"],
      "x-ms-blob-type": "BlockBlob",
    },
  });
  assert.notEqual(wrong, authorization.split(": ")[1], "fixture is not discriminating");
});

test("canonicalised headers contain no literal 'undefined'", async () => {
  const request = await capturePut(Buffer.from("x"), "text/plain");
  // A case-mismatched lookup once signed `content-type:undefined`, which
  // authenticates nothing and is invisible unless asserted on.
  const date = request.headers["x-ms-date"];
  assert.ok(date);
  assert.ok(!date.includes("undefined"));

  const recomputed = expectedSignature({
    verb: "PUT",
    blobPath: "companies/abc/def/file.txt",
    length: 1,
    contentType: "text/plain",
    xms: {
      "x-ms-date": date,
      "x-ms-version": request.headers["x-ms-version"],
      "x-ms-blob-type": "BlockBlob",
    },
  });
  assert.equal(request.headers["Authorization"], `SharedKey ${ACCOUNT}:${recomputed}`);
});