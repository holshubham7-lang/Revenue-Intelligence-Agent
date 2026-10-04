import {
  actionPlans,
  dataProfiles,
  entities,
  ensureDataIndexes,
  ingestJobs,
  kbChunks,
  kbDocuments,
  newId,
  sourceFiles,
  sources,
  type EntityDoc,
} from "@/lib/data/store";
import { getDataDb } from "@/lib/data/store";
import { indexArtifact } from "@/lib/data/knowledge";
import { blobKeyFor, getBlobStore } from "@/lib/storage/blob";
import type {
  ActionPlanDoc,
  AllowedExtension,
  DataProfileDoc,
  DataSourceDoc,
  IngestJobDoc,
  SourceFileDoc,
} from "@/lib/data/types";
import type { CanonicalRecord } from "@/lib/data/canonical";
import type { RecordMetrics } from "@/lib/data/metrics";
import type { AnalysisResult } from "@/lib/agent/analyze";

/**
 * Persistence for the upload → analysis → plan → knowledge-base pipeline.
 *
 * Every function takes `companyId` as its first argument and every query includes
 * it. That is not defensive style — it is the tenant boundary. A lookup that
 * forgets it is a cross-company data leak, and the only defence cheap enough to
 * apply to every query is to make the company id mandatory and pass it through
 * `companies` rather than to a bare `_id`.
 */

const now = () => new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Data sources and files                                                     */
/* -------------------------------------------------------------------------- */

/** Creates the data source that an upload belongs to. */
export async function createDataSource(companyId: string): Promise<DataSourceDoc> {
  await ensureDataIndexes();
  const db = await getDataDb();
  const timestamp = now();

  const doc: DataSourceDoc = {
    _id: newId(),
    companyId,
    kind: "file_upload",
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await sources(db).insertOne(doc);
  return doc;
}

/**
 * Stores the uploaded bytes and the metadata that describes them.
 *
 * The bytes go to blob storage first. If the write fails, nothing is recorded —
 * the alternative is a `source_files` row pointing at a blob that does not exist,
 * which reads as a successful upload right up until the profile step.
 */
export async function saveSourceFile(params: {
  companyId: string;
  dataSourceId: string;
  originalName: string;
  extension: AllowedExtension;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bytes: Buffer;
}): Promise<SourceFileDoc> {
  const db = await getDataDb();
  const timestamp = now();
  const fileId = newId();

  const blobPath = await getBlobStore().put(
    blobKeyFor(params.companyId, fileId, params.originalName),
    params.bytes,
    params.mimeType,
  );

  const doc: SourceFileDoc = {
    _id: fileId,
    companyId: params.companyId,
    dataSourceId: params.dataSourceId,
    originalName: params.originalName,
    extension: params.extension,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    sha256: params.sha256,
    blobPath,
    status: "ready",
    createdAt: timestamp,
  };

  try {
    await sourceFiles(db).insertOne(doc);
  } catch (err) {
    // A unique-index violation on (companyId, sha256) means this exact file is
    // already on file. Don't leave its bytes orphaned in the container.
    await getBlobStore().delete(blobPath).catch(() => undefined);
    throw err;
  }

  return doc;
}

/**
 * Re-uploading a file already held for this company is a no-op rather than an
 * error — the user re-uploading after a failed confirmation should not be told
 * their file is invalid.
 */
export async function findFileByHash(companyId: string, sha256: string): Promise<SourceFileDoc | null> {
  const db = await getDataDb();
  return sourceFiles(db).findOne({ companyId, sha256, deletedAt: { $exists: false } });
}

/** Reads a file's bytes back from blob storage. */
export async function readSourceFileBytes(doc: SourceFileDoc): Promise<Buffer> {
  return getBlobStore().get(doc.blobPath);
}

export async function listSourceFiles(companyId: string): Promise<SourceFileDoc[]> {
  const db = await getDataDb();
  return sourceFiles(db)
    .find({ companyId, deletedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Soft-deletes a file and its normalised rows.
 *
 * Soft rather than hard because the 30-day TTL exists so a customer's data can be
 * removed from backups eventually; an immediate hard delete would break that
 * promise. The blob is removed now, because leaving customer bytes in storage
 * while claiming the upload is deleted is the worst of both.
 */
export async function deleteSourceFile(companyId: string, fileId: string): Promise<boolean> {
  const db = await getDataDb();
  const file = await sourceFiles(db).findOne({ _id: fileId, companyId, deletedAt: { $exists: false } });
  if (!file) return false;

  await getBlobStore().delete(file.blobPath).catch(() => undefined);

  const timestamp = now();
  await Promise.all([
    sourceFiles(db).updateOne({ _id: fileId, companyId }, { $set: { deletedAt: timestamp, status: "rejected" } }),
    entities(db).deleteMany({ companyId, sourceFileId: fileId }),
    ingestJobs(db).updateMany(
      { companyId, dataSourceId: file.dataSourceId },
      { $set: { state: "cancelled", finishedAt: timestamp } },
    ),
  ]);

  return true;
}

/**
 * Moves the upload container through its statuses.
 *
 * The status describes the *pipeline*, not the file — a file can be stored and
 * readable while the container is still `parsing`. They are separate documents
 * because they fail differently: a bad file is a user error, a stuck container is
 * ours.
 */
export async function setDataSourceStatus(
  companyId: string,
  dataSourceId: string,
  status: DataSourceDoc["status"],
  error?: DataSourceDoc["error"],
): Promise<void> {
  const db = await getDataDb();
  await sources(db).updateOne(
    { _id: dataSourceId, companyId },
    { $set: { status, ...(error ? { error } : {}), updatedAt: now() } },
  );
}

/* -------------------------------------------------------------------------- */
/* Ingest jobs                                                                */
/* -------------------------------------------------------------------------- */

export async function startIngestJob(companyId: string, dataSourceId: string): Promise<IngestJobDoc> {
  await ensureDataIndexes();
  const db = await getDataDb();
  const timestamp = now();

  const job: IngestJobDoc = {
    _id: newId(),
    companyId,
    dataSourceId,
    kind: "upload",
    state: "running",
    step: "validating",
    progress: 5,
    attempts: 1,
    startedAt: timestamp,
    createdAt: timestamp,
  };
  await ingestJobs(db).insertOne(job);
  return job;
}

export async function advanceIngestJob(
  companyId: string,
  jobId: string,
  step: IngestJobDoc["step"],
  progress: number,
): Promise<void> {
  const db = await getDataDb();
  // Leaving `awaiting_confirmation` puts the job back into `running`, so a
  // confirmed mapping resumes the same job rather than stranding it.
  const state: IngestJobDoc["state"] = step === "awaiting_confirmation" ? "awaiting_confirmation" : "running";

  await ingestJobs(db).updateOne(
    { _id: jobId, companyId },
    { $set: { step, progress, state, updatedAt: now() } },
  );
}

/** Records that a job is blocked on the user confirming a mapping. */
export async function pauseIngestJobForConfirmation(
  companyId: string,
  jobId: string,
): Promise<void> {
  await advanceIngestJob(companyId, jobId, "awaiting_confirmation", 40);
}

export async function completeIngestJob(companyId: string, jobId: string): Promise<void> {
  const db = await getDataDb();
  await ingestJobs(db).updateOne(
    { _id: jobId, companyId },
    { $set: { state: "completed", step: "complete", progress: 100, finishedAt: now() } },
  );
}

export async function failIngestJob(
  companyId: string,
  jobId: string,
  error: { code: string; message: string },
): Promise<void> {
  const db = await getDataDb();
  const timestamp = now();
  await ingestJobs(db).updateOne(
    { _id: jobId, companyId },
    {
      $set: {
        state: "failed",
        finishedAt: timestamp,
        error: { ...error, at: timestamp },
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Entities and profiles                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Persists normalised rows, replacing anything previously written for this data
 * source.
 *
 * Replacement, not append: confirming a mapping twice is the normal case, not an
 * edge case — the user re-reads the proposals, changes `Amount` to `Net`, and
 * confirms again. Appending would then leave the first interpretation's rows
 * alongside the corrected ones, and `computeMetrics` over that collection would
 * double-count every deal. The delete is scoped to `(companyId, dataSourceId)`,
 * so a company's other uploads are untouched and a re-upload of one file never
 * discards another file's data.
 *
 * Written in batches because a 40,000-row export as 40,000 individual inserts
 * holds the connection open for minutes and can exhaust the pool. Batches of
 * 1,000 keep each round trip bounded.
 */
export async function saveEntities(params: {
  companyId: string;
  dataSourceId: string;
  sourceFileId: string;
  records: readonly CanonicalRecord[];
}): Promise<number> {
  const db = await getDataDb();
  const timestamp = now();
  const BATCH = 1_000;

  await entities(db).deleteMany({
    companyId: params.companyId,
    dataSourceId: params.dataSourceId,
  });

  let written = 0;
  for (let offset = 0; offset < params.records.length; offset += BATCH) {
    const slice = params.records.slice(offset, offset + BATCH);
    const docs: EntityDoc[] = slice.map((record, i) => ({
      ...record,
      _id: newId(),
      companyId: params.companyId,
      dataSourceId: params.dataSourceId,
      sourceFileId: params.sourceFileId,
      rowIndex: offset + i,
      createdAt: timestamp,
    }));
    await entities(db).insertMany(docs, { ordered: false });
    written += docs.length;
  }

  return written;
}

export async function saveProfile(params: {
  companyId: string;
  dataSourceId: string;
  sourceFileId: string;
  metrics: RecordMetrics;
  analysis: AnalysisResult;
  rowCount: number;
}): Promise<DataProfileDoc> {
  const db = await getDataDb();
  const timestamp = now();

  const doc: DataProfileDoc = {
    _id: newId(),
    companyId: params.companyId,
    dataSourceId: params.dataSourceId,
    sourceFileId: params.sourceFileId,
    metrics: params.metrics,
    summary: params.analysis.summary,
    semanticGaps: params.analysis.semanticGaps,
    warnings: params.analysis.warnings,
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "deterministic-fallback",
    rowCount: params.rowCount,
    degraded: params.analysis.degraded,
    createdAt: timestamp,
  };

  // One profile per report. Confirming a mapping twice re-analyses the same
  // bytes, and `readyProfiles` returns every profile a company has — so two rows
  // for one file made `buildDatasetContext` present a single upload as two
  // reports, with every metric and caveat repeated to the question agent.
  // Superseding here rather than filtering on read, because the superseded
  // analysis of identical bytes is not a version worth keeping.
  await dataProfiles(db).deleteMany({
    companyId: params.companyId,
    dataSourceId: params.dataSourceId,
  });
  await dataProfiles(db).insertOne(doc);
  return doc;
}

export async function latestProfile(
  companyId: string,
  dataSourceId?: string,
): Promise<DataProfileDoc | null> {
  const db = await getDataDb();
  return dataProfiles(db)
    .find({ companyId, ...(dataSourceId ? { dataSourceId } : {}) })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
}

/** A profiled report joined back to the file name the user will recognise. */
export type ProfiledFile = {
  fileName: string;
  profile: DataProfileDoc;
};

/**
 * Every report that has been profiled for this company, newest first.
 *
 * The funnel accepts more than one report — a sales export plus a marketing
 * spend sheet, say — and each is ingested and analysed on its own. Grounding the
 * questions on `latestProfile` alone would read only the most recent upload and
 * silently drop everything the user uploaded before it, which is exactly the
 * "questions feel like they ignore my data" failure. This returns the whole set
 * so the analysis agent can reason across the reports the user actually shared.
 *
 * File names are joined in because a question about "the marketing sheet" is
 * only answerable if the agent knows which sheet is which.
 */
export async function readyProfiles(
  companyId: string,
  dataSourceId?: string,
): Promise<ProfiledFile[]> {
  const db = await getDataDb();
  const profiles = await dataProfiles(db)
    .find({ companyId, ...(dataSourceId ? { dataSourceId } : {}) })
    .sort({ createdAt: -1 })
    .toArray();

  if (profiles.length === 0) return [];

  const names = new Map(
    (
      await sourceFiles(db)
        .find(
          { _id: { $in: profiles.map((profile) => profile.sourceFileId) } },
          { projection: { originalName: 1 } },
        )
        .toArray()
    ).map((file) => [file._id, file.originalName] as const),
  );

  return profiles.map((profile) => ({
    fileName: names.get(profile.sourceFileId) ?? "uploaded report",
    profile,
  }));
}

/* -------------------------------------------------------------------------- */
/* Action plans                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Saves a plan and indexes it in the knowledge base.
 *
 * Versioned rather than overwritten: a user who regenerates after fixing their
 * data should be able to see what changed, and the KB should keep the earlier
 * plan — it is system-generated text, which is exactly what the KB is for.
 *
 * The answers are stored on the plan document (they are the user's own words
 * about their business and the plan may need regenerating) but they are **not**
 * part of what gets indexed. `indexArtifact` projects only system-authored
 * fields, so this call cannot leak an answer into retrieved context even though
 * the same object carries them.
 */
export async function saveActionPlan(params: {
  companyId: string;
  companyName: string;
  plan: ActionPlanDoc;
  literals?: readonly string[];
}): Promise<ActionPlanDoc> {
  await ensureDataIndexes();
  const db = await getDataDb();
  const timestamp = now();

  const version = await nextVersion(params.companyId);
  const doc: ActionPlanDoc = {
    ...params.plan,
    _id: params.plan._id || newId(),
    companyId: params.companyId,
    version,
    status: "final",
    createdAt: params.plan.createdAt || timestamp,
    updatedAt: timestamp,
  };

  await actionPlans(db).insertOne(doc);

  const indexed = await indexArtifact(
    params.companyId,
    { of: "action_plan", doc },
    {
      // The company name is redacted as a literal because no pattern can
      // recognise it; everything else is caught by class in `redact`.
      literals: [params.companyName, ...(params.literals ?? [])].filter(
        (value) => value.trim().length > 2,
      ),
      companyName: params.companyName,
    },
  );

  const withKb: ActionPlanDoc = {
    ...doc,
    kb: {
      documentId: indexed.documentId,
      chunkIds: indexed.chunkIds,
      indexedAt: timestamp,
    },
  };

  await actionPlans(db).updateOne(
    { _id: doc._id, companyId: params.companyId },
    { $set: { kb: withKb.kb } },
  );

  return withKb;
}

async function nextVersion(companyId: string): Promise<number> {
  const db = await getDataDb();
  const latest = await actionPlans(db)
    .find({ companyId })
    .sort({ version: -1 })
    .limit(1)
    .next();
  return (latest?.version ?? 0) + 1;
}

export async function latestActionPlan(companyId: string): Promise<ActionPlanDoc | null> {
  const db = await getDataDb();
  return actionPlans(db).find({ companyId }).sort({ version: -1 }).limit(1).next();
}

/* -------------------------------------------------------------------------- */
/* Knowledge base reads                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Retrieves this company's indexed plan context.
 *
 * Company-scoped on both the filter and the sort. A retrieval that omitted the
 * company filter would be the single worst bug in this module — it would answer
 * one customer's question using another customer's revenue data — so it is not
 * a parameter but a constant of the function.
 */
export async function retrieveCompanyContext(
  companyId: string,
  limit = 8,
): Promise<{ title: string; kind: string; text: string }[]> {
  const db = await getDataDb();

  const documents = await kbDocuments(db)
    .find({ companyId, deletedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  if (documents.length === 0) return [];

  const chunks = await kbChunks(db)
    .find({ companyId, documentId: { $in: documents.map((d) => d._id) }, deletedAt: { $exists: false } })
    .sort({ documentId: 1, chunkIndex: 1 })
    .toArray();

  return documents.map((doc) => ({
    title: doc.title,
    kind: doc.kind,
    text: chunks
      .filter((chunk) => chunk.documentId === doc._id)
      .map((chunk) => chunk.text)
      .join("\n\n"),
  }));
}
