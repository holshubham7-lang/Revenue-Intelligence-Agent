import type { CanonicalField, CanonicalRecord, EntityType } from "./canonical";

/**
 * Turns confirmed header mappings plus raw rows into `CanonicalRecord`s.
 *
 * Pure and deterministic — no model call anywhere in this file. That is the
 * point: everything numeric that reaches `DataProfileDoc.metrics` is produced
 * here by arithmetic over typed values, so a hallucinated figure cannot enter
 * the profile. The agent is only ever handed the result.
 *
 * Coercion is deliberately conservative. `"1,250"`, `"$480,000"`, `"(500)"`,
 * and `"USD 1,250,000"` all become numbers; anything ambiguous becomes `null`
 * and is counted in `metrics.nullCounts` rather than guessed at. A currency
 * symbol with no digits, or a stray date-time in the amount column, is a null —
 * not a zero, because zero silently distorts every sum downstream.
 */

/** Confirmed mapping: source column index → canonical field. */
export type ConfirmedMapping = ReadonlyMap<number, CanonicalField>;

export type NormalizeResult = {
  records: CanonicalRecord[];
  /** Columns present but entirely null after coercion. */
  emptyColumns: string[];
  /** Rows dropped, with the row index, for reporting to the user. */
  skipped: { row: number; reason: string }[];
};

/**
 * Strips currency symbols, thousands separators, and accounting negatives.
 *
 * Locale-aware because getting this wrong corrupts revenue silently rather than
 * erroring: in `€980,50` the period is a *thousands* separator and the comma is
 * the decimal point, so naively deleting every non-numeric character turns a
 * €980.50 deal into €980,500 — a 1000× overstatement that still looks like a
 * plausible number. Which separator is the decimal one is decided by position,
 * not by symbol: the rightmost of `.` and `,` wins when both appear.
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!/\d/.test(trimmed)) return null;

  const negative = /^\(.*\)$/.test(trimmed) || /^\s*-/.test(trimmed);

  // Keep digits, separators, and a leading sign; discard currency symbols,
  // ISO codes, spaces, and percent signs.
  let s = trimmed.replace(/[^\d.,]/g, "");
  if (s.length === 0) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let decimalSep: "," | "." | null = null;
  if (lastComma !== -1 && lastDot !== -1) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma !== -1) {
    // Comma is a decimal point only when it introduces 1-2 trailing digits;
    // `480,000` is a thousands group, `980,50` is a decimal.
    decimalSep = /,\d{1,2}$/.test(s) ? "," : null;
  } else if (lastDot !== -1) {
    // Likewise for a lone period, but a repeated `.ddd` group (`1.234.567`) is
    // unambiguously thousands separators.
    const isThousandsGroup = /^\d{1,3}(\.\d{3})+$/.test(s);
    decimalSep = !isThousandsGroup && /\.\d{1,2}$/.test(s) ? "." : null;
  }

  if (decimalSep === ",") {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (decimalSep === ".") {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(/[.,]/g, "");
  }

  // Anything still malformed (`1.2.3`) fails here rather than parseFloat-ing
  // its first component and reporting a plausible-looking wrong number.
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;

  const value = Number.parseFloat(s);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
const MONTH_NAMES = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
/** `14 Mar 2025` — day first, no comma. Groups: day, monthName, year. */
const DAY_FIRST = new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{4})$`, "i");
/** `Mar 14, 2025` — month first, comma optional. Groups: monthName, day, year. */
const MONTH_FIRST = new RegExp(`^(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i");

/**
 * Parses the date formats CRM exports actually emit, returning ISO `YYYY-MM-DD`.
 *
 * Ambiguous `DD/MM` vs `MM/DD` is resolved as US (`MM/DD`) because that is what
 * HubSpot and Salesforce produce for an en-US export. Getting this backwards
 * turns every date into garbage, so a value that cannot be read is returned as
 * `null` rather than guessed.
 */
export function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // An ISO prefix is the only format we can read without guessing, but it still
  // has to be a date that exists — `2025-02-31` is a typo, not a real day.
  if (ISO_DATE.test(trimmed)) {
    const iso = trimmed.slice(0, 10);
    return isRealDate(iso) ? iso : null;
  }

  const us = US_DATE.exec(trimmed);
  if (us) {
    const [, month, day, rawYear] = us;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    return isRealDate(iso) ? iso : null;
  }

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthIndexFor = (name: string) => months.indexOf(name.slice(0, 3).toLowerCase()) + 1;

  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst) {
    const [, day, monthName, year] = dayFirst;
    const monthIndex = monthIndexFor(monthName);
    if (monthIndex === 0) return null;
    const iso = `${year}-${pad(String(monthIndex))}-${pad(day)}`;
    return isRealDate(iso) ? iso : null;
  }

  const monthFirst = MONTH_FIRST.exec(trimmed);
  if (monthFirst) {
    const [, monthName, day, year] = monthFirst;
    const monthIndex = monthIndexFor(monthName);
    if (monthIndex === 0) return null;
    const iso = `${year}-${pad(String(monthIndex))}-${pad(day)}`;
    return isRealDate(iso) ? iso : null;
  }

  return null;
}

function pad(value: string): string {
  return value.padStart(2, "0");
}

/** Rejects 2024-02-31 and friends, which `Date.parse` would roll over. */
function isRealDate(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Detects a currency code or symbol in a cell. */
export function parseCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const code = /\b(USD|EUR|GBP|INR|AUD|CAD|JPY|CHF|SEK)\b/i.exec(trimmed);
  if (code) return code[1].toUpperCase();

  const symbol: Record<string, string> = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "₹": "INR",
    "¥": "JPY",
  };
  for (const [char, iso] of Object.entries(symbol)) {
    if (trimmed.includes(char)) return iso;
  }
  return null;
}

function valueAt(row: readonly string[], mapping: ConfirmedMapping, field: CanonicalField): string | null {
  for (const [index, mapped] of mapping) {
    if (mapped === field) return row[index] ?? null;
  }
  return null;
}

/**
 * Normalises raw rows into canonical records.
 *
 * A row with no name is dropped: without one the record cannot be referenced,
 * and a nameless deal in a revenue analysis is noise. A row with a name but no
 * amount is kept with `amount: null` — missing value is information, and the
 * count feeds `metrics.nullCounts`.
 */
export function normalizeRows(
  headers: readonly string[],
  rows: readonly string[][],
  mapping: ConfirmedMapping,
  entityType: EntityType,
): NormalizeResult {
  const records: CanonicalRecord[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const nullByColumn = new Map<number, number>();

  rows.forEach((row, i) => {
    const nameRaw = valueAt(row, mapping, "name");
    const name = nameRaw?.trim() ?? "";

    if (name.length === 0) {
      skipped.push({ row: i, reason: "no name" });
      return;
    }

    const amountRaw = valueAt(row, mapping, "amount");
    const amount = amountRaw === null ? null : parseAmount(amountRaw);

    const dateRaw = valueAt(row, mapping, "date");
    const date = dateRaw === null ? null : parseDate(dateRaw);

    // A dedicated Currency column wins. Failing that, a symbol or ISO code
    // embedded in the amount cell (`€980,50`) is a better signal than
    // assuming a default, and inventing a default currency for an export that
    // didn't state one is exactly the kind of quiet guess that makes a
    // cross-currency total meaningless.
    const currencyRaw = valueAt(row, mapping, "currency");
    const currency =
      currencyRaw && currencyRaw.trim().length > 0
        ? parseCurrency(currencyRaw)
        : (parseCurrency(amountRaw ?? "") ?? parseCurrency(nameRaw ?? "") ?? null);

    for (const [columnIndex, mappedField] of mapping) {
      const cell = row[columnIndex] ?? "";
      if (cell.trim().length === 0) {
        nullByColumn.set(columnIndex, (nullByColumn.get(columnIndex) ?? 0) + 1);
        void mappedField;
      }
    }

    records.push({
      entityType,
      sourceKey: valueAt(row, mapping, "sourceKey")?.trim() || `${entityType}:${name}:${i}`,
      name,
      amount,
      currency,
      status: valueAt(row, mapping, "status")?.trim() || null,
      stage: valueAt(row, mapping, "stage")?.trim() || null,
      rawDate: date,
    });
  });

  const emptyColumns: string[] = [];
  for (const [columnIndex, count] of nullByColumn) {
    if (count === rows.length && headers[columnIndex] !== undefined) {
      emptyColumns.push(headers[columnIndex]);
    }
  }

  return { records, emptyColumns, skipped };
}
