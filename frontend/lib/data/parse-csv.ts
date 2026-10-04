/**
 * RFC 4180 CSV/TSV reader.
 *
 * Hand-rolled rather than pulled from npm because ingestion is the trust
 * boundary: a file parser is the last place before customer bytes become typed
 * values that a model will reason about, and it is worth being able to read it.
 *
 * Handles what real CRM exports actually contain, all of which naive
 * `split(",")` / `split("\n")` gets wrong:
 *
 *   - quoted fields containing the delimiter      `"Smith, John"`
 *   - escaped quotes inside quoted fields         `"He said ""yes"""`
 *   - newlines inside a quoted field              a multi-line note
 *   - CRLF and bare LF line endings
 *   - a UTF-8 BOM, which Excel prepends and which
 *     otherwise corrupts the first header name
 *
 * Deliberately *not* attempting CSV injection defence (leading `=`, `+`, `-`,
 * `@`): these values are never re-exported to a spreadsheet, they are consumed
 * by our own normaliser. If a downstream feature writes them back out, that
 * feature needs the guard, not this reader.
 */

/** Guard against a single pathological cell eating all memory. */
const MAX_CELL_CHARS = 1_000_000;

export type ParseResult =
  | { ok: true; headers: string[]; rows: string[][] }
  | { ok: false; reason: "empty" | "ragged" | "oversized_cell"; detail?: string };

/**
 * Parses delimited text into a header row plus data rows.
 *
 * `delimiter` is inferred from the header line: tab if the first line contains
 * a tab and no comma, otherwise comma. That covers `.tsv` and CSV-with-tabs
 * without asking the user.
 */
export function parseDelimited(text: string, delimiter?: "," | "\t"): ParseResult {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (content.trim().length === 0) return { ok: false, reason: "empty" };

  const sep = delimiter ?? inferDelimiter(content);

  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let sawAnyChar = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (cell.length >= MAX_CELL_CHARS) {
          return { ok: false, reason: "oversized_cell" };
        }
        cell += ch;
      }
      sawAnyChar = true;
      continue;
    }

    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      sawAnyChar = true;
      continue;
    }

    if (ch === sep) {
      row.push(cell);
      cell = "";
      sawAnyChar = true;
      continue;
    }

    if (ch === "\r") {
      if (content[i + 1] === "\n") i += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      sawAnyChar = false;
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      sawAnyChar = false;
      continue;
    }

    cell += ch;
    sawAnyChar = true;
  }

  // Trailing content without a final newline. `sawAnyChar` guards against
  // emitting a phantom empty row for a file ending in a delimiter.
  if (cell.length > 0 || sawAnyChar || row.length > 0) {
    row.push(cell);
    records.push(row);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { ok: false, reason: "empty" };

  const headers = nonEmpty[0].map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h.length === 0)) {
    return { ok: false, reason: "empty" };
  }

  const rows = nonEmpty.slice(1);

  // A short row is a trailing blank line or a truncated export; a long one means
  // an unescaped delimiter and the column indices would be wrong. Both are
  // refused rather than silently mis-mapped.
  for (const r of rows) {
    if (r.length !== headers.length) {
      return {
        ok: false,
        reason: "ragged",
        detail: `Expected ${headers.length} columns but found ${r.length}.`,
      };
    }
  }

  return { ok: true, headers, rows };
}

/** Tab when the header line has a tab and no comma, else comma. */
function inferDelimiter(content: string): "," | "\t" {
  const firstLine = content.slice(0, content.indexOf("\n") === -1 ? content.length : content.indexOf("\n"));
  const hasTab = firstLine.includes("\t");
  const hasComma = firstLine.includes(",");
  if (hasTab && !hasComma) return "\t";
  return ",";
}
