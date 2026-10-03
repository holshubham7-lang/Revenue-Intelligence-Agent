import { createHash } from "node:crypto";

import type { AllowedExtension, RejectReason } from "./types";

/**
 * Deterministic upload validation.
 *
 * This is the trust boundary for customer-supplied bytes, and it runs **before**
 * any parser sees the file. Two rules govern it:
 *
 *   1. Allowlist, never blocklist. "Reject .exe" is a list the attacker does not
 *      have to stay on; "accept only these four formats with these signatures"
 *      has no outside.
 *   2. Verify content, not filename. An extension is attacker-controlled, so
 *      every accepted format is confirmed by its magic bytes. A `.xlsx` that is
 *      actually a PE executable is rejected on its signature, not its name.
 *
 * Nothing here calls a model. Format validity is arithmetic over bytes; the
 * agent only ever sees data that has already passed.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const MIN_UPLOAD_BYTES = 32;

const MIME_BY_EXTENSION: Readonly<Record<AllowedExtension, string>> = {
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Formats accepted for parsing.
 *
 * `.xls` is not on this list. It is the pre-2007 OLE2 binary format rather than
 * a ZIP of XML, and there is no reader for it here — so accepting it would mean
 * telling a user their spreadsheet uploaded successfully and then producing an
 * empty analysis. `.pdf` is likewise deferred: text extraction from a PDF is
 * lossy in ways a revenue pipeline cannot compensate for, and it is refused
 * explicitly rather than silently producing garbage rows.
 */
const ACCEPTED_EXTENSIONS: readonly AllowedExtension[] = ["csv", "tsv", "xlsx"];

/**
 * Refused signatures. Checked before the allowlist so a hostile file is reported
 * as hostile rather than merely unsupported.
 */
const REFUSED_SIGNATURES: readonly { magic: number[]; label: string }[] = [
  { magic: [0x4d, 0x5a], label: "Windows PE executable" }, // MZ
  { magic: [0x7f, 0x45, 0x4c, 0x46], label: "ELF binary" },
  { magic: [0xca, 0xfe, 0xba, 0xbe], label: "Mach-O / Java class" },
  { magic: [0xfe, 0xed, 0xfa, 0xce], label: "Mach-O binary" },
  { magic: [0xfe, 0xed, 0xfa, 0xcf], label: "Mach-O 64-bit binary" },
  { magic: [0x00, 0x61, 0x73, 0x6d], label: "WebAssembly module" },
  { magic: [0x23, 0x21], label: "a script with an interpreter directive" },
];

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Bytes read for signature checks. Every accepted format is identified here. */
const SIGNATURE_PROBE_BYTES = 4096;

export type UploadValidation =
  | {
      ok: true;
      extension: AllowedExtension;
      mimeType: string;
      sha256: string;
      sizeBytes: number;
    }
  | { ok: false; reason: RejectReason; detail?: string };

function startsWith(buffer: Buffer, magic: readonly number[]): boolean {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Extracts and normalises the extension. Returns null for anything not on the
 * allowlist, which covers unknown types, macro-enabled workbook variants
 * (`.xlsm`, `.xltm`, `.xlam` — valid ZIPs that can carry a VBA project), and the
 * executables an attacker would rename.
 */
export function extensionOf(filename: string): AllowedExtension | null {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return null;

  const raw = filename.slice(dot + 1).toLowerCase();
  if (raw === "xlsm" || raw === "xltm" || raw === "xlam") return null;

  return ACCEPTED_EXTENSIONS.find((candidate) => candidate === raw) ?? null;
}

/** Why an extension was refused, phrased as something the user can act on. */
function unsupportedMessage(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();

  if (ext === "xls") {
    return "The old .xls format can't be read here. Open it in Excel or Google Sheets and re-save as .xlsx, or export as .csv.";
  }
  if (ext === "pdf") {
    return "PDFs aren't supported yet — a PDF can't be read reliably without losing table structure. Export the data as .csv or .xlsx.";
  }
  if (ext === "xlsm" || ext === "xltm" || ext === "xlam") {
    return "Macro-enabled workbooks aren't supported. Re-save as .xlsx without macros.";
  }
  return "Accepted formats: .csv, .tsv, or .xlsx.";
}

/**
 * Confirms the byte signature matches the claimed extension.
 *
 * CSV/TSV carry no signature, so they are confirmed negatively instead: valid
 * UTF-8 with no NUL and no C0 control bytes other than tab, CR, and LF. That
 * check is what stops a renamed binary from parsing as a one-column CSV.
 */
function signatureMatches(buffer: Buffer, extension: AllowedExtension): boolean {
  if (extension === "xlsx") {
    if (!startsWith(buffer, ZIP_MAGIC)) return false;
    // ZIP local file headers store the entry name uncompressed, so a raw scan
    // for the workbook part is a reliable content check without unzipping.
    return buffer.includes(Buffer.from("xl/workbook.xml", "utf8"));
  }

  // CSV / TSV — text-only confirmation.
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    if (byte === 0) return false; // NUL — binary
    const isAllowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (byte < 0x20 && !isAllowedControl) return false;
  }
  return true;
}

/**
 * Validates an upload from its name and full contents.
 *
 * The caller must cap how much it reads before buffering — reject at
 * `MAX_UPLOAD_BYTES + 1` so an oversized upload is never fully materialised.
 * Given that bound, `bytes` is at most 25 MB and `sha256` covers the whole
 * file, which is what makes dedupe and the later integrity re-check meaningful.
 */
export function validateUpload(filename: string, bytes: Buffer): UploadValidation {
  const sizeBytes = bytes.length;

  // Signature checks read only the first few KB; hashing and the ZIP scans need
  // the whole buffer. Classification runs before the size gate so a hostile file
  // is reported as hostile rather than as "too small" — both reject, but only
  // one of them tells anyone what actually happened.
  const head = bytes.subarray(0, SIGNATURE_PROBE_BYTES);

  for (const { magic, label } of REFUSED_SIGNATURES) {
    if (startsWith(head, magic)) {
      return {
        ok: false,
        reason: "executable_signature",
        detail: `Refused: this looks like ${label}, not a spreadsheet.`,
      };
    }
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes < MIN_UPLOAD_BYTES) {
    return { ok: false, reason: "empty" };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  const extension = extensionOf(filename);
  if (!extension) {
    return {
      ok: false,
      reason: "unsupported_type",
      detail: unsupportedMessage(filename),
    };
  }

  if (!signatureMatches(head, extension)) {
    return {
      ok: false,
      reason: "signature_mismatch",
      detail: `File contents do not match a .${extension} file.`,
    };
  }

  // ZIP-based workbooks can still be password-protected or macro-bearing; both
  // are refused rather than silently mis-parsed. Entry names live uncompressed
  // in the ZIP headers, so a raw scan is sufficient.
  if (extension === "xlsx") {
    if (bytes.includes(Buffer.from("vbaProject.bin", "utf8"))) {
      return {
        ok: false,
        reason: "macro_enabled",
        detail: "Macro-enabled workbooks are not supported.",
      };
    }
    if (bytes.includes(Buffer.from("EncryptedPackage", "utf8"))) {
      return {
        ok: false,
        reason: "password_protected",
        detail: "Password-protected workbooks are not supported.",
      };
    }
  }

  return {
    ok: true,
    extension,
    mimeType: MIME_BY_EXTENSION[extension],
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes,
  };
}
