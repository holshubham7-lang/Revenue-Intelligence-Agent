import { getDataDb, kbChunks, kbDocuments, newId } from "./store";
import { redact } from "../security/redact";
import {
  chunkText,
  composeText,
  estimateTokens,
  MIN_CHUNK_CHARS,
  type SystemArtifact,
} from "./knowledge-text";
import type { KbChunkDoc, KbDocumentDoc } from "./types";

// The pure half lives in `knowledge-text` so it can be tested without a database;
// re-exported here so callers have one obvious entry point for KB writes.
export { chunkText, composeText, estimateTokens, type SystemArtifact };

/**
 * The only write path into the knowledge base.
 *
 * Nothing else in the codebase inserts into the KB collections. That is
 * deliberate: the product rule is that the knowledge base holds
 * **system-generated text only** — never a user's answers, never a row from an
 * uploaded file. Enforcing a rule like that by convention is not enforcement, so
 * it is enforced here in three places at once:
 *
 *   1. The input is `SystemArtifact`, a union of exactly the shapes our own
 *      pipelines produce. There is no variant that accepts raw user text or raw
 *      file content, so a caller cannot pass the wrong thing.
 *   2. `composeText` renders only model-authored fields. It never emits
 *      `ActionPlanDoc.questions` or `ActionPlanDoc.answers`, both of which the
 *      plan document does carry.
 *   3. Every chunk is passed through `redact` before it is stored, and chunks
 *      that come back unclean are dropped instead of stored.
 *
 * Step 3 exists because step 1 is not sufficient on its own: model output is
 * *derived* from user input, so a rationale can quote a deal name and its value.
 * Trusting the model to keep those out is exactly the assumption that leaks.
 *
 * Chunks are redacted individually rather than the whole document, so one bad
 * paragraph costs one chunk instead of the entire memory.
 *
 * Data profiles are deliberately **not** indexed. They are system-generated and
 * would be safe by the rule above, but the user asked for action plans in the
 * knowledge base specifically; indexing profiles too would put pipeline
 * commentary into chat retrieval, where it is not what was wanted.
 */

export type IndexResult = {
  documentId: string;
  chunkIds: string[];
  dropped: number;
  redactions: number;
};

function titleFor(artifact: SystemArtifact, companyName: string | null): string {
  return `Action plan v${artifact.doc.version}${companyName ? ` — ${companyName}` : ""}`;
}

/**
 * Redacts, chunks, and stores a plan in the knowledge base.
 *
 * `literals` should carry every entity name known for this company — the
 * company name plus any account or contact names harvested at ingest. Those are
 * redacted as literals because a pattern cannot recognise them; everything else
 * is caught by class.
 */
export async function indexArtifact(
  companyId: string,
  artifact: SystemArtifact,
  options: { literals?: readonly string[]; companyName?: string | null } = {},
): Promise<IndexResult> {
  const { literals = [], companyName = null } = options;

  const composed = composeText(artifact);
  if (composed.length === 0) {
    return { documentId: "", chunkIds: [], dropped: 0, redactions: 0 };
  }

  const db = await getDataDb();
  const now = new Date().toISOString();
  const documentId = newId();

  const chunks = chunkText(composed);
  const chunkDocs: KbChunkDoc[] = [];
  let cursor = 0;
  let dropped = 0;
  let redactions = 0;

  chunks.forEach((raw, index) => {
    const result = redact(raw, { literals });
    redactions += result.redactions;

    // Drop rather than store: a chunk that is mostly redactions is not a useful
    // memory, and a partially-redacted one is worse — it reads as safe while
    // still carrying shape.
    if (!result.clean || result.text.trim().length < MIN_CHUNK_CHARS) {
      dropped += 1;
      return;
    }

    chunkDocs.push({
      _id: newId(),
      documentId,
      companyId,
      scope: "company",
      chunkIndex: index,
      text: result.text,
      charStart: cursor,
      charEnd: cursor + result.text.length,
      tokenCount: estimateTokens(result.text),
      createdAt: now,
    });
    cursor += result.text.length;
  });

  const document: KbDocumentDoc = {
    _id: documentId,
    companyId,
    scope: "company",
    kind: "action_plan",
    title: titleFor(artifact, companyName),
    sourceId: artifact.doc._id,
    // Stores the redacted text only. The pre-redaction composition exists in
    // memory for the duration of this call and is never persisted.
    text: chunkDocs.map((c) => c.text).join("\n\n"),
    tokenCount: chunkDocs.reduce((sum, c) => sum + c.tokenCount, 0),
    anonymized: false,
    createdAt: now,
    updatedAt: now,
  };

  await kbDocuments(db).insertOne(document);
  if (chunkDocs.length > 0) {
    await kbChunks(db).insertMany(chunkDocs);
  }

  return {
    documentId,
    chunkIds: chunkDocs.map((c) => c._id),
    dropped,
    redactions,
  };
}
