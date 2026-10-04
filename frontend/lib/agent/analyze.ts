import type { CompanyDoc } from "@/lib/companies";
import { buildCompanyProfile, type FoundryMessage } from "@/lib/agent/foundry";
import type { RecordMetrics } from "@/lib/data/metrics";
import { safeLabel } from "@/lib/data/metrics";
import { renderDataset, renderMetrics, type DatasetContext } from "@/lib/agent/dataset";

export { renderDataset, renderMetrics } from "@/lib/agent/dataset";
export type { DatasetContext, DatasetEntry, DatasetFile } from "@/lib/agent/dataset";

/**
 * Re-exported so callers that already import the agent module do not need a
 * second one. `buildDatasetContext` lives in `dataset.ts` because it is pure
 * assembly with no model in it, which is what makes it directly testable.
 */
export { buildDatasetContext } from "@/lib/agent/dataset";

/**
 * The two model calls in the data pipeline, both grounded on deterministic
 * metrics.
 *
 * The split matters more than the prompts. `lib/data/metrics.ts` computes every
 * number; these functions receive those numbers as text and may only produce
 * prose. That is what keeps a hallucinated total out of `DataProfileDoc.metrics`
 * and therefore out of the action plan, which is where a wrong figure would do
 * real damage — a user acting on a confidently wrong number.
 *
 * Neither function is given a row from the file. They see the shape (stage
 * counts, missing-value counts, date range) and the company's own profile, both
 * of which the user already typed or which are counts. Deal names and amounts
 * never reach the model, so a prompt-injection attempt hidden in a cell has
 * nothing to attach to.
 *
 * Both degrade rather than fail. A pipeline that hard-fails when the engine is
 * unreachable leaves a user unable to get an action plan at all, which is worse
 * than a thinner one built from metrics we already have.
 */

const model = process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "gpt-5.6-sol";
const timeoutMs = Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? 120_000);
const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
const apiKey = process.env.AZURE_OPENAI_KEY ?? "";

async function complete(messages: FoundryMessage[]): Promise<string> {
  if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is not set.");

  const response = await fetch(`${endpoint}/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "api-key": apiKey, Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: 2048,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Agent engine error ${response.status}: ${await response.text().catch(() => "")}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/* -------------------------------------------------------------------------- */
/* JSON extraction                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Pulls a JSON object out of a model response.
 *
 * Models wrap JSON in prose or code fences even when told not to, so this tries
 * the raw text, then any fenced block, then the outermost `{...}` span. Returns
 * null rather than throwing — a caller with a deterministic fallback should not
 * have to catch.
 */
export function extractJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next representation
    }
  }
  return null;
}

function stringList(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* 1. Data analysis                                                           */
/* -------------------------------------------------------------------------- */

export type AnalysisResult = {
  summary: string;
  semanticGaps: string[];
  warnings: string[];
  /** True when the engine was unreachable and this came from metrics alone. */
  degraded: boolean;
};

/**
 * Asks the model to interpret the shape of the data.
 *
 * The prompt states that the numbers are exact and must not be restated, and
 * that the model may only add interpretation. Every number in the output is
 * therefore a repeat of one we computed — if the model invents one, it is
 * inventing a string, not corrupting a field.
 */
export async function analyzeData(
  company: CompanyDoc,
  metrics: RecordMetrics,
  nowIso: string,
  reportLabel?: string,
): Promise<AnalysisResult> {
  const prompt = [
    "You are analysing the shape of a business's report, to prepare a Revenue Intelligence action plan.",
    "",
    "Company profile:",
    buildCompanyProfile(company),
    "",
    reportLabel
      ? `The user uploaded this file: ${safeLabel(reportLabel)}`
      : "The user uploaded one report.",
    reportLabel
      ? "Treat it as whatever kind of report it actually is — a sales pipeline export, a marketing spend sheet, a customer-success or churn view, or an operations extract. Do not assume it contains pipeline stages if the metrics show none."
      : "",
    "",
    `Metrics computed exactly by our own system as of ${nowIso}:`,
    renderMetrics(metrics),
    "",
    "Using only the structure above, write:",
    `1. A "summary" of 2-3 sentences describing what this report actually shows.`,
    `2. "semanticGaps": up to 4 short strings naming things this report CANNOT tell us, which matter for revenue intelligence.`,
    `3. "warnings": up to 4 short strings naming data-quality risks visible in the metrics (missing values, duplicates, stale records, no dates, mixed currencies).`,
    "",
    "Rules you must follow:",
    "- Do not invent, estimate, or alter any number. The figures above are exact; you may only refer to them.",
    "- Do not guess customer names, industries, or deal sizes. You cannot see them.",
    "- Be specific to what the metrics show. Generic advice is worthless here.",
    "",
    'Respond with ONLY JSON: {"summary":"...","semanticGaps":["..."],"warnings":["..."]}',
  ].join("\n");

  try {
    const parsed = extractJsonObject(await complete([{ role: "user", content: prompt }]));

    const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
    const semanticGaps = stringList(parsed?.semanticGaps, 4, 300);
    const warnings = stringList(parsed?.warnings, 4, 300);

    if (summary.length < 20) throw new Error("analysis output was unusable");

    return { summary, semanticGaps, warnings, degraded: false };
  } catch {
    return { ...deterministicAnalysis(metrics), degraded: true };
  }
}

/**
 * The fallback: read the metrics directly.
 *
 * Not a stub. When the engine is down, the numbers we already computed are the
 * substance of the analysis, and a user still gets a real plan from them.
 */
function deterministicAnalysis(metrics: RecordMetrics): Omit<AnalysisResult, "degraded"> {
  const topStage = Object.entries(metrics.stageCounts).sort((a, b) => b[1] - a[1])[0];
  const missingAmount = metrics.nullCounts.amount ?? 0;
  const missingDate = metrics.nullCounts.date ?? 0;

  const parts: string[] = [];
  if (metrics.totalRecords === 0) {
    parts.push("No usable records were found in this file.");
  } else {
    parts.push(
      `This export contains ${metrics.totalRecords.toLocaleString()} pipeline records${
        metrics.dateRange ? ` dated ${metrics.dateRange.from} to ${metrics.dateRange.to}` : " with no usable dates"
      }.`,
    );
  }
  if (topStage) {
    parts.push(`The largest stage is ${topStage[0]} with ${topStage[1]} record(s).`);
  }
  if (missingAmount > 0) {
    parts.push(`${missingAmount} record(s) have no value, so totals are understated.`);
  }
  if (missingDate > 0) {
    parts.push(`${missingDate} record(s) have no date, so they cannot be aged or forecast.`);
  }
  if (metrics.duplicateCount > 0) {
    parts.push(`${metrics.duplicateCount} possible duplicate(s) may be double-counting revenue.`);
  }

  const semanticGaps = [
    "This export has no win/loss reason, so we cannot see why deals are lost.",
    "There is no activity or touch history, so deal momentum is unknown.",
    "No contract value or term length is visible, so recurring revenue cannot be separated from one-off sales.",
  ];
  const warnings = [
    ...(missingAmount > 0 ? [`${missingAmount} record(s) are missing a value.`] : []),
    ...(missingDate > 0 ? [`${missingDate} record(s) are missing a date.`] : []),
    ...(metrics.duplicateCount > 0
      ? [`${metrics.duplicateCount} possible duplicate row(s) — totals may be overstated.`]
      : []),
    ...(metrics.staleRecordCount > 0
      ? [`${metrics.staleRecordCount} record(s) have a date over 30 days old.`]
      : []),
  ];

  return { summary: parts.join(" "), semanticGaps, warnings };
}

/* -------------------------------------------------------------------------- */
/* 2. Data-informed questions                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when the engine cannot produce questions.
 *
 * Deliberately not swallowed into a canned list. A fixed question set is the
 * one thing this step must not be: it is indistinguishable from a working agent,
 * so a broken deployment would quietly keep serving a generic interview that
 * ignores everything the user uploaded. Failing loudly lets the page offer a
 * retry and the user choose to go back to their data.
 */
export class QuestionGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionGenerationError";
  }
}

/**
 * Generates the questions the user answers before an action plan is written.
 *
 * Always a model call. There is no static set on any path — including the
 * "skipped the upload" path, which simply grounds the writer on the company
 * profile alone.
 *
 * @param context Every analysed report the user shared, or `null` when they
 *   chose not to upload. When present, the stored analysis from the analysis
 *   agent is included alongside the metrics: the questions are meant to close
 *   the blind spots that analysis identified, which is only possible if the
 *   writer can see them.
 */
export async function generateDataQuestions(
  company: CompanyDoc,
  context: DatasetContext | null,
  count = 5,
): Promise<string[]> {
  const prompt = [
    context
      ? `You are asking a business owner ${count} questions about their revenue operations, grounded in ${context.files.length} report(s) they just uploaded and our analysis agent has already read.`
      : `You are asking a business owner ${count} questions about their revenue operations. They chose not to share any data, so ground the questions in what they told you about the company instead.`,
    "",
    "Company profile:",
    buildCompanyProfile(company),
  ];

  if (context && context.files.length > 0) {
    prompt.push(
      "",
      "Reports they uploaded, with metrics computed exactly by our own system and the analysis agent's reading of each:",
      renderDataset(context),
    );
    if (context.caveats.length > 0) {
      prompt.push("", `Caveats on the data itself: ${context.caveats.join(" ")}`);
    }
  }

  prompt.push(
    "",
    `Write exactly ${count} questions that will fill the most important blind spots for this business.`,
    "Rules:",
    "- Each question must be answerable in 1-3 sentences by a busy owner.",
    "- Do NOT ask for a number that is already visible in the reports above. Asking for something they just uploaded is a poor question.",
    context
      ? "- The analysis agent already listed what the data cannot show. Each question must target one of those specific blind spots."
      : "- Ask about things only the owner knows: why deals stall, how pricing is set, who the buyers really are, what happens after close.",
    "- Refer to their business specifically.",
    "- Never repeat a question, and never ask two questions about the same thing.",
    "",
    `Respond with ONLY JSON: {"questions":["question 1", ...]}`,
  );

  let parsed: ReturnType<typeof extractJsonObject>;
  try {
    parsed = extractJsonObject(await complete([{ role: "user", content: prompt.join("\n") }]));
  } catch (error) {
    throw new QuestionGenerationError(
      `Question generation is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const questions = stringList(parsed?.questions, count, 400);
  if (questions.length === 0) {
    throw new QuestionGenerationError("Question generation returned no usable questions.");
  }

  return questions;
}
