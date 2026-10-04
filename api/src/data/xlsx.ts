import { inflateRawSync } from "node:zlib";

/**
 * A minimal `.xlsx` reader.
 *
 * An `.xlsx` is a ZIP of XML parts. This reads the ZIP central directory,
 * inflates the four parts that matter, and walks the sheet grid — enough to turn
 * a CRM export into rows of strings.
 *
 * The alternative was adding a spreadsheet dependency for the same result. The
 * format subset actually needed here is small and stable: Excel, Sheets, and
 * every CRM export all write this same structure. What this reader
 * deliberately does *not* do is support every corner of OOXML — formulas are
 * read as their cached values, styles are ignored, and charts and drawings are
 * not parsed, because none of those carry data a pipeline needs.
 *
 * `.xls` (the pre-2007 OLE2 binary format) is **not** supported. It is a
 * different, undocumented binary layout; hand-rolling it would mean a parser
 * that is wrong in ways nobody notices. The upload validator refuses `.xls`
 * with a "save as .xlsx" message instead of accepting a file we can't read.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Guards against a zip-bomb: refuse an entry whose declared size is absurd. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** Beyond this, a "spreadsheet" is not a data export. */
const MAX_SHEET_ROWS = 50_000;

type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

/**
 * Reads the ZIP central directory.
 *
 * The central directory rather than sequential local headers, because a writer
 * may use data descriptors (where sizes are unknown at write time) or store
 * entries out of order. Scanning local headers would silently truncate such
 * files.
 */
function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  // EOCD is at the very end, after an optional comment of up to 64 KB.
  const eocdOffset = findEocd(buffer);
  if (eocdOffset === -1) throw new Error("not a zip container");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let pointer = buffer.readUInt32LE(eocdOffset + 16);

  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < totalEntries; i += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) {
      break;
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const size = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const offset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);

    entries.set(name, { name, method, compressedSize, size, offset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function readEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  if (entry.size > MAX_ENTRY_BYTES) throw new Error("workbook part is too large");

  // Local header repeats the name/extra lengths, and the data starts after them.
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const dataStart = entry.offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`unsupported zip compression method ${entry.method}`);
}

/* -------------------------------------------------------------------------- */
/* XML — regex-based, not a parser                                            */
/* -------------------------------------------------------------------------- */

/**
 * Extracts the text of `<t>` elements.
 *
 * A full XML parser is overkill here and adds a dependency, but this does need
 * to unescape the five entities that appear in real spreadsheet text: a deal
 * named `Smith & Sons` or `Q1 > Q2` would otherwise reach the pipeline with
 * literal `&amp;` and `&gt;` in the cell value.
 */
function textBetween(xml: string, tag: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  for (const match of xml.matchAll(pattern)) {
    out.push(unescapeXml(match[1]));
  }
  return out;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * Sheet names, in workbook order.
 *
 * `<sheet>` elements are self-closing (`<sheet name="Deals" .../>`), so this
 * matches the attribute rather than trying to pair start and end tags.
 */
function readSheetNames(workbookXml: string): string[] {
  return [...workbookXml.matchAll(/<sheet[^>]*\bname="([^"]*)"/g)].map((m) => unescapeXml(m[1]));
}

/** Resolves a workbook relationship id to its part path, e.g. `rId1`. */
function readRelationshipTargets(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Shared strings                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `sharedStrings.xml` holds one `<si>` per unique string. A `<si>` is usually a
 * single `<t>` but may be split across several runs (`<si><r><t>a</t></r><r><t>b</t></r></si>`)
 * when part of it is formatted differently — concatenating all `<t>` inside each
 * `<si>` handles both.
 */
function readSharedStrings(entries: Map<string, ZipEntry>, buffer: Buffer): string[] {
  const entry = entries.get("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = readEntry(buffer, entry).toString("utf8");
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    textBetween(si[1], "t").join(""),
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet grid                                                                 */
/* -------------------------------------------------------------------------- */

/** `BC12` → column 54, row 11. Column letters are base-26 with A=0. */
function parseCellRef(ref: string): { column: number; row: number } {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  const digits = /(\d+)$/.exec(ref)?.[1] ?? "1";

  let column = 0;
  for (let i = 0; i < letters.length; i += 1) {
    column = column * 26 + (letters.charCodeAt(i) - 64);
  }
  return { column: column - 1, row: Number.parseInt(digits, 10) - 1 };
}

export type Sheet = { name: string; headers: string[]; rows: string[][] };

export type WorkbookRead =
  | { ok: true; sheets: Sheet[] }
  | { ok: false; reason: "corrupt" | "no_sheets"; detail?: string };

/**
 * Reads every sheet in a workbook.
 *
 * Rows are returned as dense string arrays: a row with gaps is padded with empty
 * strings so column indices always line up with the header. Sparse rows are
 * normal in Excel (trailing empty cells are simply not written), and handing a
 * ragged array to the CSV-style normaliser would make a real workbook look
 * malformed.
 */
export function readWorkbook(bytes: Buffer): WorkbookRead {
  let entries: Map<string, ZipEntry>;
  try {
    entries = readZipEntries(bytes);
  } catch (err) {
    return {
      ok: false,
      reason: "corrupt",
      detail: err instanceof Error ? err.message : "could not read the workbook",
    };
  }

  const workbookEntry = entries.get("xl/workbook.xml");
  if (!workbookEntry) return { ok: false, reason: "corrupt", detail: "no workbook part" };

  let sharedStrings: string[] = [];
  try {
    sharedStrings = readSharedStrings(entries, bytes);

    const workbookXml = readEntry(bytes, workbookEntry).toString("utf8");
    const names = readSheetNames(workbookXml);
    if (names.length === 0) return { ok: false, reason: "no_sheets" };

    const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
    const targets = relsEntry
      ? readRelationshipTargets(readEntry(bytes, relsEntry).toString("utf8"))
      : new Map<string, string>();

    // Sheet order and part order can differ, so walk workbook order and resolve
    // each sheet's part through its relationship id rather than assuming
    // `sheet1.xml` is the first sheet.
    const sheetRefs = [...workbookXml.matchAll(/<sheet[^>]*r:id="([^"]*)"/g)].map((m) => m[1]);
    const sheets: Sheet[] = [];

    for (const [index, name] of names.entries()) {
      const relId = sheetRefs[index];
      const target = relId ? targets.get(relId) : undefined;
      const partName = target ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}` : `xl/worksheets/sheet${index + 1}.xml`;
      const sheetEntry = entries.get(partName) ?? entries.get(`xl/worksheets/sheet${index + 1}.xml`);
      if (!sheetEntry) continue;

      sheets.push(readSheet(bytes, sheetEntry, sharedStrings, name));
    }

    return { ok: true, sheets };
  } catch (err) {
    return {
      ok: false,
      reason: "corrupt",
      detail: err instanceof Error ? err.message : "could not read the workbook",
    };
  }
}

function readSheet(
  bytes: Buffer,
  entry: ZipEntry,
  sharedStrings: string[],
  name: string,
): Sheet {
  const xml = readEntry(bytes, entry).toString("utf8");

  const grid: string[][] = [];
  let rowCount = 0;

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rowCount >= MAX_SHEET_ROWS) break;
    rowCount += 1;

    const cells: string[] = [];
    // `r` is absent on cells Excel emitted sequentially, so fall back to
    // positional order rather than dropping the value.
    let autoColumn = 0;

    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];

      const { column } = ref ? parseCellRef(ref) : { column: autoColumn };
      autoColumn = column + 1;

      const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? "n";
      let value = "";

      if (type === "s") {
        const index = Number.parseInt(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "", 10);
        value = sharedStrings[index] ?? "";
      } else if (type === "inlineStr") {
        value = textBetween(body, "t").join("");
      } else if (type === "b") {
        value = /<v>1<\/v>/.test(body) ? "TRUE" : "FALSE";
      } else if (type === "e") {
        // An error cell (`#REF!`, `#DIV/0!`) — carry it as text so the row is
        // visible to the user rather than silently blank.
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      } else {
        // Numeric, and also the cached result of a formula, which is what we
        // want: a currency-formatted 480000.5 must not arrive as "480000.5".
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }

      cells[column] = value;
    }

    // Pad holes so column indices line up with the header row.
    const filled = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
    grid.push(filled);
  }

  const nonEmpty = grid.filter((row) => row.some((cell) => cell.trim().length > 0));
  const headers = (nonEmpty[0] ?? []).map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((row) => {
    const padded = Array.from({ length: headers.length }, (_, i) => row[i] ?? "");
    return padded;
  });

  return { name, headers, rows };
}
