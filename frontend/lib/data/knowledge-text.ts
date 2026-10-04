/**
 * The knowledge base's text projection, kept free of database and blob imports.
 *
 * This is a pure module on purpose. `composeText` defines what the product is
 * willing to remember about a company — system-authored synthesis only, never
 * the user's own words and never a row from an uploaded file — so it is the part
 * most worth testing directly. Keeping it separate means the guarantee can be
 * verified without a Mongo connection or a `MONGODB_URI`.
 *
 * Persistence and redaction live in `knowledge.ts`; that is the only caller.
 */

import type { ActionPlanDoc } from "./types.ts";

export const TARGET_CHUNK_CHARS = 1200;
export const MAX_CHUNK_CHARS = 1800;
export const MIN_CHUNK_CHARS = 40;

/** Rough token estimate: adequate for budgeting, deliberately not a tokenizer. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type SystemArtifact = { readonly of: "action_plan"; readonly doc: ActionPlanDoc };

/**
 * Renders a plan to indexable text.
 *
 * Explicitly excluded: `questions` and `answers` (the user's own words), and any
 * raw row from an uploaded file. Included: `profileSummary`, `diagnosis`,
 * `projectedImpact`, and each action's title, rationale, metric, and impact —
 * the model's own synthesis.
 *
 * Note that `ActionPlanDoc` *does* carry `questions` and `answers`. Not touching
 * them here is the whole point: the exclusion is a decision in this function
 * rather than an accident of the document's shape.
 */
export function composeText(artifact: SystemArtifact): string {
  const plan = artifact.doc;
  const lines: string[] = [];

  if (plan.profileSummary) lines.push(plan.profileSummary.trim());
  if (plan.diagnosis) lines.push(plan.diagnosis.trim());
  if (plan.projectedImpact?.summary) lines.push(plan.projectedImpact.summary.trim());

  for (const action of plan.actions) {
    lines.push(
      [
        action.title,
        action.rationale,
        `Priority ${action.priority}, effort ${action.effort}, due in ${action.dueDays} days.`,
        action.metric ? `Success metric: ${action.metric}.` : "",
        action.expectedImpact ? `Expected impact: ${action.expectedImpact}.` : "",
      ]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join(" "),
    );
  }

  return lines.join("\n\n").trim();
}

/**
 * Splits text on paragraph boundaries, packing paragraphs into chunks near
 * `TARGET_CHUNK_CHARS`. Over-long paragraphs are hard-split so a single long
 * field cannot produce a chunk too big to embed.
 */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length >= MIN_CHUNK_CHARS) chunks.push(trimmed);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_CHARS) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += MAX_CHUNK_CHARS) {
        chunks.push(paragraph.slice(offset, offset + MAX_CHUNK_CHARS));
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > TARGET_CHUNK_CHARS) flush();
    current = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
  }

  flush();
  return chunks;
}
