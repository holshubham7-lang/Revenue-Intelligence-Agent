import type { CompanyDoc } from "../companies";
import type {
  ActionPlanAction,
  ActionPlanDoc,
  DataProfileDoc,
  Effort,
  Priority,
} from "../data/types";
import { buildCompanyProfile, type FoundryMessage } from "./foundry";
import {
  extractJsonObject,
  renderDataset,
  renderMetrics,
  type DatasetContext,
} from "./analyze";

/**
 * Action plan generation.
 *
 * This is the step the whole pipeline exists to serve, so the constraints on it
 * are strict:
 *
 *   1. The model writes the plan. It is never allowed to write a number that
 *      isn't already in `metrics` or in a figure the user's own answers supply.
 *      A revenue plan is the one artefact a user will act on directly, so a
 *      hallucinated figure here costs real money rather than a wasted paragraph.
 *   2. The user's answers inform it but are never stored in the knowledge base.
 *      `indexArtifact` renders `diagnosis`, action titles, rationales, and
 *      impact only — `answers` is deliberately not part of that projection.
 *   3. If the engine returns something structurally wrong, the plan is built
 *      deterministically instead. A plan with three real actions beats no plan.
 *
 * Every action carries the metric used to judge it, because an action without a
 * way to tell whether it worked is a task, not a plan.
 */

const model = process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "gpt-5.6-sol";
const timeoutMs = Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? 120_000);
const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
const actionCount = 4;

async function complete(messages: FoundryMessage[]): Promise<string> {
  if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is not set.");

  const response = await fetch(`${endpoint}/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "api-key": apiKey, Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, max_completion_tokens: 4096, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Agent engine error ${response.status}: ${await response.text().catch(() => "")}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

const PRIORITIES: readonly Priority[] = ["high", "medium", "low"];
const EFFORTS: readonly Effort[] = ["low", "medium", "high"];

function asPriority(value: unknown): Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value)
    ? (value as Priority)
    : "medium";
}

function asEffort(value: unknown): Effort {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value)
    ? (value as Effort)
    : "medium";
}

/** A due date 7-180 days out. Out-of-range values are clamped, not trusted. */
function asDueDays(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(180, Math.max(7, Math.round(parsed)));
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * Parses the model's plan, discarding anything malformed.
 *
 * Validation is per-action rather than all-or-nothing: if the model returns four
 * good actions and one missing a rationale, three survive. Rejecting the whole
 * plan over one field would make a formatting slip look like a system failure.
 */
function parseActions(value: unknown): ActionPlanAction[] {
  if (!Array.isArray(value)) return [];

  const actions: ActionPlanAction[] = [];
  for (const [index, raw] of value.entries()) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;

    const title = text(item.title, 160);
    if (title.length === 0) continue;

    actions.push({
      id: `action_${index + 1}`,
      title,
      rationale: text(item.rationale, 600),
      priority: asPriority(item.priority),
      effort: asEffort(item.effort),
      owner: text(item.owner, 120) || "Founder",
      dueDays: asDueDays(item.dueDays),
      metric: text(item.metric, 200),
      expectedImpact: text(item.expectedImpact, 400),
    });
  }

  return actions;
}

export type PlanInput = {
  company: CompanyDoc;
  /** The newest profile, kept for the deterministic fallback path. */
  profile: DataProfileDoc | null;
  /**
   * Every report the user uploaded, with the analysis agent's reading of each.
   *
   * The plan is grounded on the whole set rather than the newest profile: a user
   * who shared a pipeline export *and* a marketing spend sheet is describing one
   * business across two files, and a plan written from only the second would
   * recommend fixes to the wrong part of it.
   */
  dataset: DatasetContext | null;
  questions: readonly string[];
  answers: readonly string[];
  nowIso: string;
};

/**
 * Writes the plan.
 *
 * Answers are included in the prompt because they are the user's own words about
 * their business and are the most informative input available. They are passed
 * as a delimited block and the prompt instructs the model not to quote them, so
 * the plan reads as analysis rather than as a transcript — and, separately, the
 * knowledge-base writer never indexes them.
 */
export async function generateActionPlan(input: PlanInput): Promise<ActionPlanDoc> {
  const { company, profile, dataset, questions, answers, nowIso } = input;

  const sections: string[] = [
    `Write a Revenue Intelligence action plan for ${company.companyName || "this business"}.`,
    "",
    "Company profile:",
    buildCompanyProfile(company),
  ];

  if (dataset && dataset.files.length > 0) {
    sections.push(
      "",
      `The owner shared ${dataset.files.length} report(s). Metrics below are computed exactly by our own system; treat each figure as authoritative and never restate it differently.`,
      renderDataset(dataset),
    );
  } else if (profile) {
    // No dataset assembled (older caller, or the context builder found nothing).
    // Still ground on the single profile rather than dropping the data entirely.
    sections.push(
      "",
      "Pipeline metrics, computed exactly by our own system:",
      renderMetrics(profile.metrics),
      "",
      "Analysis of that data:",
      profile.summary,
    );
    if (profile.semanticGaps.length > 0) {
      sections.push(`What this data cannot show: ${profile.semanticGaps.join(" ")}`);
    }
    if (profile.warnings.length > 0) {
      sections.push(`Data-quality warnings: ${profile.warnings.join(" ")}`);
    }
  }

  if (questions.length > 0) {
    const qa = questions
      .map((question, i) => `Q${i + 1}: ${question}\nA${i + 1}: ${answers[i]?.trim() || "(not answered)"}`)
      .join("\n\n");
    sections.push(
      "",
      "The owner's answers to questions about their business (use these, do not quote them back):",
      qa,
    );
  }

  sections.push(
    "",
    `Produce a diagnosis and exactly ${actionCount} concrete actions.`,
    "",
    "Rules:",
    "- Every action must be specific to this business and doable by a small team in the stated timeframe.",
    "- Never state a figure that is not in the metrics above or a number the owner gave you.",
    "- Each action needs a `metric` — the specific number they watch to know it worked.",
    "- `owner` is a role, not a name.",
    "",
    'Respond with ONLY JSON: {"diagnosis":"...","projectedImpact":"...","actions":[{"title":"...","rationale":"...","priority":"high|medium|low","effort":"low|medium|high","owner":"...","dueDays":30,"metric":"...","expectedImpact":"..."}]}',
  );

  const now = nowIso;
  let diagnosis = "";
  let projectedImpact = "";
  let actions: ActionPlanAction[] = [];

  try {
    const parsed = extractJsonObject(await complete([{ role: "user", content: sections.join("\n") }]));
    diagnosis = text(parsed?.diagnosis, 4000);
    projectedImpact = text(parsed?.projectedImpact, 1200);
    actions = parseActions(parsed?.actions);
  } catch {
    // Fall through to the deterministic plan below.
  }

  if (actions.length === 0) {
    const fallback = deterministicPlan(company, profile);
    diagnosis = diagnosis || fallback.diagnosis;
    projectedImpact = projectedImpact || fallback.projectedImpact;
    actions = fallback.actions;
  }

  return {
    _id: "",
    companyId: "",
    version: 1,
    status: "final",
    questions: [...questions],
    answers: [...answers],
    dataSourceIds: [...new Set((dataset?.files ?? []).map((file) => file.dataSourceId))],
    profileSummary: dataset?.files.map((file) => file.summary).filter(Boolean).join(" ") ?? profile?.summary,
    diagnosis,
    actions,
    projectedImpact: { summary: projectedImpact },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A plan built from metrics alone, used when the engine is unreachable or returns
 * something unusable.
 *
 * The actions are not filler: each one corresponds to a specific thing the metrics
 * actually showed. A plan that names the problem the data revealed is useful even
 * without a model in the loop.
 */
function deterministicPlan(company: CompanyDoc, profile: DataProfileDoc | null): {
  diagnosis: string;
  projectedImpact: string;
  actions: ActionPlanAction[];
} {
  const name = company.companyName || "Your business";
  const actions: ActionPlanAction[] = [];

  if (!profile) {
    return {
      diagnosis: `No pipeline data was uploaded for ${name}, so this plan is based on your company profile and answers alone. Start by getting a clean export of your pipeline — nearly everything below is easier once deal values and close dates are trustworthy.`,
      projectedImpact:
        "Establishing a reliable pipeline baseline first means every later decision is made on real numbers instead of memory.",
      actions: [
        {
          id: "action_1",
          title: "Export your pipeline to CSV and upload it here",
          rationale:
            "Every recommendation in this plan is better when grounded in your actual deal values, stages, and close dates. Right now they are inferred from a profile.",
          priority: "high",
          effort: "low",
          owner: "Founder",
          dueDays: 7,
          metric: "Pipeline uploaded and analysed",
          expectedImpact: "Replaces assumptions with measured numbers across all later work.",
        },
        {
          id: "action_2",
          title: "Make sure every deal has a value and a close date",
          rationale:
            "Deals missing either one cannot be forecast or aged, and quietly distort any total you report.",
          priority: "high",
          effort: "low",
          owner: "Sales lead",
          dueDays: 14,
          metric: "Percentage of deals with both a value and a close date",
          expectedImpact: "Totals you report start matching reality.",
        },
        {
          id: "action_3",
          title: "Define what happens when a deal stalls, and who owns it",
          rationale: "Stalls are the most common source of lost revenue and the least visible without an agreed rule.",
          priority: "medium",
          effort: "low",
          owner: "Founder",
          dueDays: 21,
          metric: "Stalled deals older than 30 days",
          expectedImpact: "Stalled deals get worked instead of quietly ageing.",
        },
      ],
    };
  }

  const m = profile.metrics;
  const missingAmount = m.nullCounts.amount ?? 0;
  const missingDate = m.nullCounts.date ?? 0;

  const diagnosisParts: string[] = [
    `${name}'s pipeline holds ${m.totalRecords.toLocaleString()} records${
      m.dateRange ? ` dated ${m.dateRange.from} to ${m.dateRange.to}` : " with no usable dates"
    }.`,
  ];
  if (missingAmount > 0) diagnosisParts.push(`${missingAmount} have no value, so any total is understated.`);
  if (missingDate > 0) diagnosisParts.push(`${missingDate} have no close date, so they cannot be forecast.`);
  if (m.duplicateCount > 0) {
    diagnosisParts.push(`${m.duplicateCount} look duplicated, so totals may be overstated.`);
  }

  actions.push({
    id: "action_1",
    title: "Fill in the missing values and dates in your pipeline",
    rationale: diagnosisParts.join(" "),
    priority: "high",
    effort: "low",
    owner: "Sales lead",
    dueDays: 14,
    metric: "Records missing a value or close date",
    expectedImpact: `Removes the ${missingAmount + missingDate} record(s) that currently cannot be forecast or counted.`,
  });

  if (m.duplicateCount > 0) {
    actions.push({
      id: "action_2",
      title: "De-duplicate the pipeline",
      rationale: `${m.duplicateCount} row(s) repeat the same name and value, which double-counts revenue in every report.`,
      priority: "high",
      effort: "low",
      owner: "Sales lead",
      dueDays: 10,
      metric: "Duplicate rows in the next export",
      expectedImpact: "Totals stop overstating revenue.",
    });
  }

  if (m.staleRecordCount > 0) {
    actions.push({
      id: "action_3",
      title: "Work or close out the stale deals",
      rationale: `${m.staleRecordCount} record(s) have a date over 30 days old and are still open.`,
      priority: "medium",
      effort: "medium",
      owner: "Sales lead",
      dueDays: 30,
      metric: "Open deals older than 30 days",
      expectedImpact: "Stale pipeline stops being counted as forecast.",
    });
  }

  actions.push({
    id: "action_4",
    title: "Agree what happens when a deal stalls",
    rationale: "Pipeline data shows where deals stop but not why. A written rule makes that visible.",
    priority: "medium",
    effort: "low",
    owner: "Founder",
    dueDays: 21,
    metric: "Stalled deals worked within 7 days of stalling",
    expectedImpact: "Fewer deals die quietly in the middle of the pipeline.",
  });

  return {
    diagnosis: diagnosisParts.join(" "),
    projectedImpact: `Making values and dates complete and removing duplicates makes your reported revenue trustworthy; working stale deals converts forecast into closed revenue.`,
    actions: actions.slice(0, 4),
  };
}
