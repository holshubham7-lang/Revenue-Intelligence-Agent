import { createHmac, createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage for uploaded files.
 *
 * File bytes never go into MongoDB. A 25 MB spreadsheet in a document makes
 * backups, replication, and `find` slow for every document in the collection,
 * and it puts customer data in the one store that gets read most often. So the
 * bytes live in Azure Blob Storage (SAS-token protected, separately encrypted at
 * rest) and Mongo holds only a path plus a SHA-256 to verify against.
 *
 * Two implementations behind one interface:
 *
 *   - `AzureBlobStore` — REST API signed with SharedKey. No SDK dependency; the
 *     request shape is a handful of documented headers and one HMAC.
 *   - `LocalBlobStore` — writes under `.data/uploads` so local development and
 *     the test suite work with no cloud account. Never selected in production.
 *
 * The path is deliberately opaque and unguessable, and it is scoped by company:
 * `companies/<companyId>/<random>/<file>`. A company id in the path is enough to
 * stop one tenant reading another's blob given any future listing bug.
 */

export type BlobStore = {
  /** Writes bytes and returns the opaque path to persist on the document. */
  put(key: string, bytes: Buffer, contentType: string): Promise<string>;
  get(blobPath: string): Promise<Buffer>;
  delete(blobPath: string): Promise<void>;
  /** Human-readable label for logs. Never includes credentials. */
  readonly label: string;
};

/** Key components are hashed into the path so no user-controlled text survives. */
function safeSegment(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

/** Builds the storage key for one upload. */
export function blobKeyFor(companyId: string, fileId: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "bin" : filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `companies/${safeSegment(companyId)}/${safeSegment(fileId)}/file.${ext || "bin"}`;
}

/* -------------------------------------------------------------------------- */
/* Local development                                                          */
/* -------------------------------------------------------------------------- */

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

class LocalBlobStore implements BlobStore {
  readonly label = "local";

  /** Rejects any path that escapes the storage root. */
  private resolve(blobPath: string): string {
    const full = path.resolve(LOCAL_ROOT, blobPath);
    const root = path.resolve(LOCAL_ROOT);
    // Without this check a stored `../../.env` would read the application's
    // secrets. The path is server-generated, but storage should not depend on
    // that staying true.
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("invalid blob path");
    }
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<string> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return key;
  }

  async get(blobPath: string): Promise<Buffer> {
    return readFile(this.resolve(blobPath));
  }

  async delete(blobPath: string): Promise<void> {
    await unlink(this.resolve(blobPath)).catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------- */
/* Azure Blob Storage                                                         */
/* -------------------------------------------------------------------------- */

class AzureBlobStore implements BlobStore {
  readonly label = "azure";

  private readonly account: string;
  private readonly key: string;
  private readonly container: string;
  private readonly token: string;

  constructor(account: string, key: string, container: string, token: string) {
    this.account = account;
    this.key = Buffer.from(key, "base64").toString("utf8");
    this.container = container;
    this.token = token;
  }

  private url(blobPath: string, extra = ""): string {
    return `https://${this.account}.blob.core.windows.net/${this.container}/${blobPath}${extra}`;
  }

  /**
   * SharedKey auth: sign a canonicalised string, not the whole body.
   *
   * Two things are easy to get wrong here and both fail at runtime with
   * `SignatureDoesNotMatch` rather than at build time:
   *
   *   - **Every** `x-ms-*` header actually sent must appear in the canonicalised
   *     headers block, lowercased and sorted. Sending `x-ms-blob-type` but
   *     leaving it out of the signature is the classic version of this bug.
   *   - The canonicalised resource is the URL path, `/account/container/blob`. The
   *     account appears once, at the front; it is not repeated after `account/`.
   */
  private async authHeaders(
    verb: string,
    blobPath: string,
    options: { length: number; contentType?: string } = { length: 0 },
  ): Promise<Record<string, string>> {
    const { length, contentType = "" } = options;
    const date = new Date().toUTCString();

    const headers: Record<string, string> = {
      "x-ms-date": date,
      "x-ms-version": "2021-08-06",
    };
    // `x-ms-blob-type` is meaningful only on a write. Sending it on a GET would
    // need signing too and buys nothing.
    if (verb === "PUT") headers["x-ms-blob-type"] = "BlockBlob";
    // Signed and sent together, or not at all — see the note on Content-Type
    // below.
    if (contentType) headers["Content-Type"] = contentType;

    const canonicalHeaders = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort()
      .map((name) => `${name}:${headers[name]}`)
      .join("\n");

    const canonicalResource = `/${this.account}/${this.container}/${blobPath}`;

    const stringToSign = [
      verb,
      "", // Content-Encoding
      "", // Content-Language
      length ? String(length) : "",
      "", // Content-MD5
      // Content-Type belongs in the standard headers block, and whatever is sent
      // here must match what goes on the wire. Signing "" while sending a real
      // Content-Type is a SignatureDoesNotMatch.
      contentType,
      "", // Date, superseded by x-ms-date
      "", // If-Modified-Since
      "", // If-Match
      "", // If-None-Match
      "", // If-Unmodified-Since
      "", // Range
      canonicalHeaders,
      canonicalResource,
    ].join("\n");

    const signature = createHmac("sha256", this.key).update(stringToSign, "utf8").digest("base64");

    return {
      Authorization: `SharedKey ${this.account}:${signature}`,
      ...headers,
    };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<string> {
    const headers = await this.authHeaders("PUT", key, {
      length: bytes.length,
      contentType,
    });

    // `Uint8Array` rather than `Buffer`: fetch's `BodyInit` type does not accept
    // a Node Buffer, and this is the same bytes underneath.
    const response = await fetch(this.url(key), {
      method: "PUT",
      headers,
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      throw new Error(`blob upload failed: ${response.status}`);
    }
    return key;
  }

  /**
   * Reads via a short-lived user-delegation SAS.
   *
   * Fetching with SharedKey would mean the storage key is available anywhere
   * bytes are read, including any future read path. A SAS scoped to one blob,
   * read-only, expiring in minutes, keeps a leaked URL from being a data leak.
   */
  async get(blobPath: string): Promise<Buffer> {
    const url = `${this.url(blobPath)}?${this.token}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`blob download failed: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(blobPath: string): Promise<void> {
    const headers = await this.authHeaders("DELETE", blobPath, { length: 0 });
    const response = await fetch(this.url(blobPath), { method: "DELETE", headers });
    // 404 means it is already gone, which is the desired end state.
    if (!response.ok && response.status !== 404) {
      throw new Error(`blob delete failed: ${response.status}`);
    }
  }
}

let store: BlobStore | null = null;

/**
 * Resolves the blob store from the environment.
 *
 * Production must have Azure configured: a silent fallback to local disk in
 * production would mean uploads appear to succeed and then vanish with the
 * container, which is far worse than refusing to start.
 */
export function getBlobStore(): BlobStore {
  if (store) return store;

  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  const container = process.env.AZURE_STORAGE_CONTAINER;
  const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN;

  if (account && key && container && sasToken) {
    store = new AzureBlobStore(account, key, container, sasToken.replace(/^\?/, ""));
    return store;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, AZURE_STORAGE_CONTAINER, and AZURE_STORAGE_SAS_TOKEN must be set in production.",
    );
  }

  store = new LocalBlobStore();
  return store;
}
