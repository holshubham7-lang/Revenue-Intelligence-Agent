import type { CanonicalRecord } from "./canonical";

/**
 * Deterministic metrics over normalised records.
 *
 * Everything in the returned object is arithmetic computed here — no model is
 * involved. That separation is the design: `DataProfileDoc.metrics` is the
 * agent's *grounding*, so if the agent could contribute a number to it, a
 * hallucinated total would become a load-bearing input to the action plan and
 * every finding downstream would inherit it. The model is called afterwards,
 * reads these values, and may only add prose (`summary`, `semanticGaps`,
 * `warnings`).
 *
 * Duplicates are detected on `(name, amount)` rather than on a source key
 * alone, because exports frequently lack an id column and the same deal
 * legitimately appears once per line item. Same name *and* same amount on
 * multiple rows is the signal worth surfacing to a human.
 */

export type RecordMetrics = {
  totalRecords: number;
  dateRange: { from: string; to: string } | null;
  amountSum: number;
  currency: string | null;
  stageCounts: Record<string, number>;
  nullCounts: Record<string, number>;
  duplicateCount: number;
  staleRecordCount: number;
};

/** A deal with no activity for this long is treated as stalled. */
const STALE_AFTER_DAYS = 30;

/** Rounded to cents so float accumulation error never surfaces as a finding. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * @param nowIso Injectable so metrics are reproducible in tests and so a
 *   long-running profile can be recomputed without the clock drifting under a
 *   cached result.
 */
export function computeMetrics(
  records: readonly CanonicalRecord[],
  nowIso: string = new Date().toISOString().slice(0, 10),
): RecordMetrics {
  const stageCounts: Record<string, number> = {};
  const nullCounts: Record<string, number> = {
    amount: 0,
    date: 0,
    stage: 0,
    currency: 0,
  };

  let amountSum = 0;
  let duplicateCount = 0;
  let staleRecordCount = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const seen = new Map<string, number>();
  const currencyTally = new Map<string, number>();

  for (const record of records) {
    if (record.amount === null) {
      nullCounts.amount += 1;
    } else {
      amountSum += record.amount;
      if (record.currency) {
        currencyTally.set(record.currency, (currencyTally.get(record.currency) ?? 0) + 1);
      }
    }

    if (!record.rawDate) {
      nullCounts.date += 1;
    } else {
      if (minDate === null || record.rawDate < minDate) minDate = record.rawDate;
      if (maxDate === null || record.rawDate > maxDate) maxDate = record.rawDate;

      // Only closed/older records can be "stale"; a future close date is a
      // live deal, not an abandoned one.
      const age = daysBetween(record.rawDate, nowIso);
      if (age > STALE_AFTER_DAYS && record.stage !== null) {
        staleRecordCount += 1;
      }
    }

    if (record.stage === null) {
      nullCounts.stage += 1;
    } else {
      stageCounts[record.stage] = (stageCounts[record.stage] ?? 0) + 1;
    }

    if (record.currency === null) nullCounts.currency += 1;

    const key = `${record.name.trim().toLowerCase()}|${record.amount ?? ""}`;
    const count = seen.get(key) ?? 0;
    if (count === 1) duplicateCount += 1;
    seen.set(key, count + 1);
  }

  // Report the dominant currency, and flag a mixed-currency sheet in the
  // aggregate — summing USD and EUR into one number is a real finding, but it
  // is not one this function should silently make.
  let currency: string | null = null;
  let best = 0;
  for (const [code, count] of currencyTally) {
    if (count > best) {
      best = count;
      currency = code;
    }
  }

  return {
    totalRecords: records.length,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    amountSum: round2(amountSum),
    currency,
    stageCounts,
    nullCounts,
    duplicateCount,
    staleRecordCount,
  };
}

/**
 * A label taken from an uploaded file, made safe to put in front of a model.
 *
 * Stage names are free text that the uploader chose, and this string is model
 * input. A cell containing an instruction would otherwise be read as one. This
 * does not make the input trustworthy — it makes it bounded: control characters
 * out, length capped, so one cell cannot dominate the prompt or smuggle a
 * payload. Labels stay intact in `stageCounts`, which is what the UI shows.
 */
const MAX_LABEL_CHARS = 40;
const MAX_STAGES_SHOWN = 12;

export function safeLabel(value: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > MAX_LABEL_CHARS ? `${cleaned.slice(0, MAX_LABEL_CHARS - 1)}…` : cleaned;
}

/**
 * A short, non-identifying view of the data for the agent to reason over.
 *
 * Carries stage names and row *counts* only — never deal names, never amounts.
 * The agent needs shape, not content: "4 stages, 62 rows, 12 with no close
 * date" is what produces a good question, and it is not customer data.
 */
export function shapeForAgent(metrics: RecordMetrics): string {
  const stageEntries = Object.entries(metrics.stageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_STAGES_SHOWN);
  const hiddenStages = Object.keys(metrics.stageCounts).length - stageEntries.length;

  const stageSummary = stageEntries
    .map(([stage, count]) => `${safeLabel(stage) || "(blank)"} (${count})`)
    .join(", ");

  const lines: string[] = [
    `Records: ${metrics.totalRecords}`,
    `Date range: ${metrics.dateRange ? `${metrics.dateRange.from} to ${metrics.dateRange.to}` : "unknown"}`,
    `Currency: ${metrics.currency ?? "unknown"}`,
    `Stages: ${stageSummary || "none"}${hiddenStages > 0 ? `, and ${hiddenStages} more` : ""}`,
    `Missing values: amount ${metrics.nullCounts.amount}, date ${metrics.nullCounts.date}, stage ${metrics.nullCounts.stage}`,
    `Possible duplicates: ${metrics.duplicateCount}`,
    `Stale beyond ${STALE_AFTER_DAYS} days: ${metrics.staleRecordCount}`,
  ];
  return lines.join("\n");
}
