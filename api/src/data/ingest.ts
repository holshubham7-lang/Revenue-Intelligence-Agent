// Explicit `.ts` extensions throughout. `allowImportingTsExtensions` is enabled
// for this reason: these modules are imported directly by the node:test runner,
// and Node's ESM resolver will not guess an extension on a value import.
import { computeMetrics, shapeForAgent, type RecordMetrics } from "./metrics.ts";
import {
  inferEntityType,
  proposeMapping,
  type CanonicalField,
  type ColumnProposal,
  type EntityType,
  type MappingProposal,
} from "./canonical.ts";
import { normalizeRows, type ConfirmedMapping } from "./normalize.ts";
import { parseDelimited } from "./parse-csv.ts";
import { readWorkbook } from "./xlsx.ts";
import type { AllowedExtension } from "./types.ts";

/**
 * The deterministic half of ingestion: bytes in, typed records out.
 *
 * Nothing in this file calls a model. It is the part of the pipeline that has to
 * be right no matter what the model does, so it is written to be readable and
 * testable rather than clever:
 *
 *   bytes → parse → propose column mapping → (user confirms) → normalise →
 *   metrics → entity rows
 *
 * The mapping is *proposed* here and confirmed by a human in the UI before
 * anything is persisted. That confirmation is not ceremony: mapping `ARR` to
 * deal value when the real number is `Deal Value` yields an action plan built on
 * a total that is wrong by whatever ratio those two differ by, and nothing
 * downstream would ever look wrong.
 */

export type ParsedSheet = { name: string; headers: string[]; rows: string[][] };

export type ParseOutcome =
  | { ok: true; sheets: ParsedSheet[] }
  | { ok: false; reason: "empty" | "ragged" | "corrupt_workbook" | "too_large"; detail?: string };

/**
 * Reads an uploaded file into sheets of strings.
 *
 * CSV and TSV have no sheet concept, so they come back as a single sheet named
 * after the file. The caller treats all formats uniformly from here on.
 */
export function parseUploadedFile(
  bytes: Buffer,
  extension: AllowedExtension,
  filename: string,
): ParseOutcome {
  if (extension === "xlsx") {
    const workbook = readWorkbook(bytes);
    if (!workbook.ok) {
      return {
        ok: false,
        reason: "corrupt_workbook",
        detail: workbook.detail ?? "This workbook could not be opened.",
      };
    }
    const sheets = workbook.sheets
      .map((sheet) => ({ name: sheet.name, headers: sheet.headers, rows: sheet.rows }))
      .filter((sheet) => sheet.headers.length > 0 && sheet.headers.some((h) => h.length > 0));

    if (sheets.length === 0) {
      return { ok: false, reason: "empty", detail: "This workbook has no sheets with a header row." };
    }
    return { ok: true, sheets };
  }

  const parsed = parseDelimited(bytes.toString("utf8"));
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason === "ragged" ? "ragged" : "empty",
      detail: parsed.reason === "ragged" ? parsed.detail : "This file has no readable rows.",
    };
  }

  return {
    ok: true,
    sheets: [{ name: filename.replace(/\.[^.]+$/, ""), headers: parsed.headers, rows: parsed.rows }],
  };
}

/** Row cap. Past this the user has exported the wrong thing. */
export const MAX_ROWS = 50_000;

export type InspectOutcome =
  | {
      ok: true;
      sheet: ParsedSheet;
      sheetNames: string[];
      mapping: MappingProposal;
      rowCount: number;
    }
  | { ok: false; reason: "too_large" | "unmappable_columns" | "no_data"; detail?: string };

/**
 * Inspects one sheet and produces the mapping proposal for the UI.
 *
 * Rows are counted rather than fully normalised: this runs on the upload request
 * and the user only needs the headers and a row count to confirm the mapping.
 * Full normalisation happens after confirmation.
 */
export function inspectSheet(sheets: ParsedSheet[], sheetName?: string): InspectOutcome {
  const sheet = sheetName ? sheets.find((s) => s.name === sheetName) : sheets[0];
  if (!sheet) {
    return { ok: false, reason: "no_data", detail: "That sheet could not be found." };
  }
  if (sheet.rows.length === 0) {
    return { ok: false, reason: "no_data", detail: "That sheet has a header but no rows." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return {
      ok: false,
      reason: "too_large",
      detail: `This sheet has ${sheet.rows.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()} — narrow the export and try again.`,
    };
  }

  const mapping = proposeMapping(sheet.headers);
  return {
    ok: true,
    sheet,
    sheetNames: sheets.map((s) => s.name),
    mapping,
    rowCount: sheet.rows.length,
  };
}

/** The client sends this after reviewing the proposal. */
export type ConfirmedColumn = { header: string; field: CanonicalField | null };

/**
 * Validates a client-confirmed mapping.
 *
 * Re-validated rather than trusted: the browser is the least trustworthy part of
 * this system, and a mapping naming a header that isn't in the file, or a
 * canonical field that doesn't exist, would otherwise reach the normaliser and
 * throw deep inside it. Returns the index-keyed map the normaliser wants.
 */
export function buildConfirmedMapping(
  headers: readonly string[],
  confirmed: readonly ConfirmedColumn[],
): { ok: true; mapping: ConfirmedMapping; entityType: EntityType } | { ok: false; message: string } {
  const VALID: readonly CanonicalField[] = [
    "sourceKey",
    "name",
    "amount",
    "currency",
    "status",
    "stage",
    "date",
  ];

  const mapping = new Map<number, CanonicalField>();
  const claimed = new Set<CanonicalField>();

  for (const column of confirmed) {
    if (column.field === null) continue;

    if (!VALID.includes(column.field)) {
      return { ok: false, message: `Unknown field "${column.field}".` };
    }
    const index = headers.indexOf(column.header);
    if (index === -1) {
      return { ok: false, message: `Column "${column.header}" is not in this file.` };
    }
    if (claimed.has(column.field)) {
      return { ok: false, message: `Two columns are mapped to "${column.field}". Pick one.` };
    }

    claimed.add(column.field);
    mapping.set(index, column.field);
  }

  // A record with no name cannot be referenced in an action plan, so that one is
  // the minimum. A value column is not: an event log or company extract has none,
  // and every row simply carries `amount: null`, which downstream reads as "this
  // report has no money in it" rather than as a total of zero.
  if (!claimed.has("name")) {
    return { ok: false, message: "Choose which column holds the deal or account name." };
  }

  return { ok: true, mapping, entityType: inferEntityType(headers) };
}

export type IngestOutcome =
  | {
      ok: true;
      records: ReturnType<typeof normalizeRows>["records"];
      metrics: RecordMetrics;
      shape: string;
      skipped: number;
    }
  | { ok: false; reason: "no_data" | "too_large"; detail?: string };

/**
 * Runs the confirmed mapping over a sheet and produces records, metrics, and the
 * non-identifying shape the analysis agent is allowed to see.
 */
export function ingestSheet(
  sheet: ParsedSheet,
  mapping: ConfirmedMapping,
  entityType: EntityType,
): IngestOutcome {
  if (sheet.rows.length === 0) {
    return { ok: false, reason: "no_data" };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, reason: "too_large" };
  }

  const { records, skipped } = normalizeRows(sheet.headers, sheet.rows, mapping, entityType);

  if (records.length === 0) {
    return {
      ok: false,
      reason: "no_data",
      detail: "No rows had a name in the column you chose.",
    };
  }

  const metrics = computeMetrics(records);
  return { ok: true, records, metrics, shape: shapeForAgent(metrics), skipped: skipped.length };
}

export type { ColumnProposal, MappingProposal, CanonicalField, EntityType, RecordMetrics };
