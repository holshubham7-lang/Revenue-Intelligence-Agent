import type { RecordMetrics } from "../data/metrics.ts";
import { safeLabel } from "../data/metrics.ts";

/**
 * The hand-off between the analysis agent and the question writer.
 *
 * `lib/data/metrics.ts` decides what the data *is*; the analysis agent writes
 * prose about it into `DataProfileDoc`; this module folds every stored profile
 * into the single context the question writer reads. Nothing here calls a model
 * and nothing here interprets — it only assembles and validates, so a question
 * set can be traced back to exactly the metrics and analysis it was built from.
 *
 * Kept free of `@/` imports so `node --test` can load it directly.
 */

/**
 * One analysed report, as the question writer sees it.
 *
 * The numbers are the deterministic ones from `computeMetrics`; the prose is
 * whatever the analysis agent said about them.
 */
export type DatasetFile = {
  fileName: string;
  /** Which upload this came from, so a plan can cite its sources. */
  dataSourceId: string;
  metrics: RecordMetrics;
  summary: string;
  semanticGaps: readonly string[];
  warnings: readonly string[];
  degraded: boolean;
};

/**
 * Every report the user shared, analysed and reduced to one grounded context.
 *
 * Passing the metrics *without* the stored analysis is what previously made the
 * questions read as though the data had never been opened: the agent had already
 * established that the export carried no attribution, and the questions asked
 * about attribution anyway.
 */
export type DatasetContext = {
  files: readonly DatasetFile[];
  /** True when at least one report carried real rows. */
  valid: boolean;
  /** Why the dataset is not usable, when `valid` is false. */
  blockers: readonly string[];
  /** Non-fatal data-quality notes, surfaced but never blocking. */
  caveats: readonly string[];
};

/** A stored profile joined to the file name the user will recognise. */
export type DatasetEntry = {
  fileName: string;
  profile: {
    dataSourceId: string;
    metrics: RecordMetrics;
    summary: string;
    semanticGaps: readonly string[];
    warnings: readonly string[];
    degraded: boolean;
  };
};

/**
 * Folds every profiled report into the single context the question writer uses.
 *
 * Validity is decided here arithmetically, with no model involved — the same
 * separation `metrics.ts` maintains. A dataset is valid when at least one report
 * actually carries rows; anything less cannot ground a question, and asking
 * anyway is what produces an interview that ignores the upload.
 *
 * Every report is kept, not just the newest. The funnel accepts several reports
 * at once and each is analysed on its own; grounding on one file would drop the
 * others the moment they were analysed.
 */
export function buildDatasetContext(
  entries: readonly DatasetEntry[],
  fallbackFileName = "uploaded report",
): DatasetContext {
  const files: DatasetFile[] = entries.map((entry) => ({
    // Bounded: a file name is user-chosen text and is model input.
    fileName: safeLabel(entry.fileName) || fallbackFileName,
    dataSourceId: entry.profile.dataSourceId,
    metrics: entry.profile.metrics,
    summary: entry.profile.summary.trim(),
    semanticGaps: entry.profile.semanticGaps,
    warnings: entry.profile.warnings,
    degraded: entry.profile.degraded,
  }));

  const withRows = files.filter((file) => file.metrics.totalRecords > 0);
  const blockers: string[] = [];
  const caveats: string[] = [];

  if (files.length === 0) {
    blockers.push("no_report_analysed");
  } else if (withRows.length === 0) {
    blockers.push("no_records");
  }

  // A report that parsed but carries no value, date, or stage is structurally
  // empty — the user uploaded the right file, but the columns that matter were
  // not mapped. Worth saying so, never worth blocking on.
  for (const file of withRows) {
    const { amount, date, stage } = file.metrics.nullCounts;
    if (amount === file.metrics.totalRecords) {
      caveats.push(`${file.fileName} has no value column filled in.`);
    }
    if (date === file.metrics.totalRecords) {
      caveats.push(`${file.fileName} has no dates.`);
    }
    if (stage === file.metrics.totalRecords) {
      caveats.push(`${file.fileName} has no stage or category column.`);
    }
  }

  return { files, valid: blockers.length === 0, blockers, caveats };
}

/** Renders metrics as the prompt block. Deterministic text, no rows. */
export function renderMetrics(metrics: RecordMetrics): string {
  const stages = Object.entries(metrics.stageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => `${stage}: ${count}`)
    .join("; ");

  const missing = Object.entries(metrics.nullCounts)
    .filter(([, count]) => count > 0)
    .map(([field, count]) => `${field}: ${count}`)
    .join("; ");

  return [
    `- Records: ${metrics.totalRecords}`,
    `- Date range: ${metrics.dateRange ? `${metrics.dateRange.from} to ${metrics.dateRange.to}` : "not available"}`,
    `- Currency: ${metrics.currency ?? "not stated"}`,
    `- Stages present: ${stages || "none"}`,
    `- Records missing a value — ${missing || "none"}`,
    `- Possible duplicate rows: ${metrics.duplicateCount}`,
    `- Records with a date over 30 days old: ${metrics.staleRecordCount}`,
  ].join("\n");
}

/**
 * Renders the dataset for the question writer.
 *
 * Per report: the exact metrics first, then the analysis agent's own reading of
 * them. The metrics lead so the grounding survives even where the stored
 * analysis fell back to deterministic prose (`degraded: true`) — and that case is
 * labelled, so a fallback reading is never passed off as the agent's judgement.
 */
export function renderDataset(context: DatasetContext): string {
  const blocks = context.files.map((file, index) => {
    const lines = [`Report ${index + 1}: ${file.fileName}`, renderMetrics(file.metrics)];

    if (file.summary) {
      lines.push(
        `Our analysis agent read this as: ${file.summary}`,
        file.degraded ? "(That reading is a deterministic fallback, not a model.)" : "",
      );
    }
    if (file.semanticGaps.length > 0) {
      lines.push(`What this report cannot tell us: ${file.semanticGaps.join(" ")}`);
    }
    if (file.warnings.length > 0) {
      lines.push(`Data-quality risks in this report: ${file.warnings.join(" ")}`);
    }

    return lines.filter(Boolean).join("\n");
  });

  return blocks.join("\n\n");
}
