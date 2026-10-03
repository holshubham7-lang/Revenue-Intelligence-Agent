/**
 * Tests for the workbook reader and the confirmed-mapping validator.
 *
 * The XLSX cases build real ZIP containers in memory rather than checking in a
 * binary fixture, so the expectations are readable and a failure points at the
 * format handling rather than at a hex blob.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";

import { readWorkbook } from "../data/xlsx.ts";
import { buildConfirmedMapping, parseUploadedFile } from "../data/ingest.ts";

/* -------------------------------------------------------------------------- */
/* Minimal ZIP writer, for building test fixtures                             */
/* -------------------------------------------------------------------------- */

type ZipInput = { name: string; content: string };

/** Builds a single-ZIP-archive from the given parts. */
function makeZip(parts: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const nameBuf = Buffer.from(part.name, "utf8");
    const data = Buffer.from(part.content, "utf8");
    const compressed = deflateRawSync(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // mod time
    local.writeUInt32LE(0, 12); // mod date
    local.writeUInt32LE(0, 14); // crc32
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    // Central directory record — field offsets are per the ZIP spec, and are not
    // the same as the local header's.
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // deflate
    central.writeUInt32LE(0, 12); // mod time
    central.writeUInt32LE(0, 14); // mod date
    central.writeUInt32LE(0, 16); // crc32
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** A one-sheet workbook with shared strings and a numeric column. */
function buildWorkbook(rows: string[][], sheetName = "Deals"): Buffer {
  const shared = ["Deal name", "Amount", "Stage", "Close date"];
  const unique = [...shared];
  for (const row of rows) {
    for (const cell of row) if (!unique.includes(cell)) unique.push(cell);
  }

  const sharedXml = `<?xml version="1.0"?><sst count="${unique.length}" uniqueCount="${unique.length}">${unique
    .map((s) => `<si><t>${s}</t></si>`)
    .join("")}</sst>`;

  const sharedIndex = (value: string) => unique.indexOf(value);

  const allRows = [shared, ...rows];
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>${allRows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
          if (value === "" || value === null) return "";
          return `<c r="${ref}" t="s"><v>${sharedIndex(value)}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("")}</sheetData></worksheet>`;

  return makeZip([
    { name: "xl/workbook.xml", content: `<?xml version="1.0"?><workbook><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", content: sharedXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);
}

/* -------------------------------------------------------------------------- */
/* XLSX                                                                       */
/* -------------------------------------------------------------------------- */

test("reads a workbook with a shared-string table", () => {
  const zip = buildWorkbook([
    ["Northwind", "480000", "Negotiation", "2025-01-10"],
    ["Acme", "120000", "Won", "2025-02-01"],
  ]);

  const result = readWorkbook(zip);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.sheets.length, 1);
  assert.deepEqual(result.sheets[0].headers, ["Deal name", "Amount", "Stage", "Close date"]);
  assert.equal(result.sheets[0].rows.length, 2);
  assert.equal(result.sheets[0].rows[0][0], "Northwind");
  assert.equal(result.sheets[0].rows[1][2], "Won");
});

test("reads numeric cells as text so amounts stay parseable", () => {
  const sharedXml = `<?xml version="1.0"?><sst count="1" uniqueCount="1"><si><t>Amount</t></si></sst>`;
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
    `<row r="2"><c r="A2"><v>480000.55</v></c></row>` +
    `</sheetData></worksheet>`;

  const zip = makeZip([
    { name: "xl/workbook.xml", content: `<?xml version="1.0"?><workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", content: sharedXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);

  const result = readWorkbook(zip);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sheets[0].rows[0][0], "480000.55", "must not lose precision to a float");
});

test("pads sparse rows so column indices line up with the header", () => {
  // Row 2 writes only column C — the trailing A and B are simply absent.
  const sharedXml = `<?xml version="1.0"?><sst count="3" uniqueCount="3"><si><t>A</t></si><si><t>B</t></si><si><t>C</t></si></sst>`;
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
    `<row r="2"><c r="C2" t="s"><v>2</v></c></row>` +
    `</sheetData></worksheet>`;

  const zip = makeZip([
    { name: "xl/workbook.xml", content: `<?xml version="1.0"?><workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", content: sharedXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);

  const result = readWorkbook(zip);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const row = result.sheets[0].rows[0];
  assert.equal(row.length, 3, "padded to the header width");
  assert.equal(row[0], "", "A is absent, not shifted");
  assert.equal(row[2], "C");
});

test("unescapes XML entities in cell text", () => {
  const sharedXml = `<?xml version="1.0"?><sst count="2" uniqueCount="2"><si><t>Smith &amp; Sons</t></si><si><t>Q1 &gt; Q2</t></si></sst>`;
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData><row r="1">` +
    `<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>`;

  const zip = makeZip([
    { name: "xl/workbook.xml", content: `<?xml version="1.0"?><workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", content: sharedXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);

  const result = readWorkbook(zip);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.sheets[0].headers, ["Smith & Sons", "Q1 > Q2"]);
});

test("surfaces error cells instead of silently blanking them", () => {
  const sharedXml = `<?xml version="1.0"?><sst count="1" uniqueCount="1"><si><t>Amount</t></si></sst>`;
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
    `<row r="2"><c r="A2" t="e"><v>#REF!</v></c></row>` +
    `</sheetData></worksheet>`;

  const zip = makeZip([
    { name: "xl/workbook.xml", content: `<?xml version="1.0"?><workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", content: sharedXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);

  const result = readWorkbook(zip);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sheets[0].rows[0][0], "#REF!");
});

test("refuses a corrupt workbook rather than returning empty data", () => {
  const result = readWorkbook(Buffer.from("PK\x03\x04 this is not a real workbook"));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "corrupt");
});

test("parseUploadedFile routes xlsx through the workbook reader", () => {
  const zip = buildWorkbook([["Northwind", "480000", "Open", "2025-01-01"]]);
  const result = parseUploadedFile(zip, "xlsx", "deals.xlsx");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sheets[0].headers[0], "Deal name");
});

test("parseUploadedFile reads a csv as a single sheet named after the file", () => {
  const csv = Buffer.from("Deal name,Amount\nNorthwind,480000\n");
  const result = parseUploadedFile(csv, "csv", "my-deals.csv");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].name, "my-deals");
  assert.deepEqual(result.sheets[0].headers, ["Deal name", "Amount"]);
});

/* -------------------------------------------------------------------------- */
/* Confirmed mapping validation                                               */
/* -------------------------------------------------------------------------- */

const HEADERS = ["Deal name", "Amount", "Stage", "Close Date"];

test("accepts a valid confirmed mapping", () => {
  const result = buildConfirmedMapping(HEADERS, [
    { header: "Deal name", field: "name" },
    { header: "Amount", field: "amount" },
    { header: "Stage", field: "stage" },
    { header: "Close Date", field: "date" },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entityType, "deal");
  assert.equal(result.mapping.get(0), "name");
  assert.equal(result.mapping.get(1), "amount");
});

test("rejects a mapping with no name column", () => {
  const result = buildConfirmedMapping(HEADERS, [{ header: "Amount", field: "amount" }]);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /name/i);
});

/**
 * A value column is not required. An event log or a company extract has none, and
 * refusing such a file means the user cannot share the report they actually hold.
 */
test("accepts a mapping with no amount column", () => {
  const result = buildConfirmedMapping(HEADERS, [{ header: "Deal name", field: "name" }]);
  assert.equal(result.ok, true);
});

test("rejects two columns claiming the same field", () => {
  const result = buildConfirmedMapping(HEADERS, [
    { header: "Deal name", field: "name" },
    { header: "Amount", field: "amount" },
    { header: "Stage", field: "amount" },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /two columns/i);
});

test("rejects a column that is not in the file", () => {
  const result = buildConfirmedMapping(HEADERS, [
    { header: "Deal name", field: "name" },
    { header: "Amount", field: "amount" },
    { header: "Nonexistent Column", field: "stage" },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /not in this file/i);
});

test("rejects a field that is not a canonical field", () => {
  // Cast because in production this arrives as untyped JSON from the request
  // body — which is exactly why the validator checks it at runtime rather than
  // relying on the compiler.
  const columns = [
    { header: "Deal name", field: "name" },
    { header: "Amount", field: "amount" },
    { header: "Stage", field: "notARealField" },
  ] as unknown as Parameters<typeof buildConfirmedMapping>[1];

  const result = buildConfirmedMapping(HEADERS, columns);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /unknown field/i);
});

test("allows columns to be ignored", () => {
  const result = buildConfirmedMapping(HEADERS, [
    { header: "Deal name", field: "name" },
    { header: "Amount", field: "amount" },
    { header: "Stage", field: null },
    { header: "Close Date", field: null },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mapping.size, 2);
});
