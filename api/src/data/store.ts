import { ObjectId, type Collection, type Db } from "mongodb";

import { getDb } from "../db";
import type {
  ActionPlanDoc,
  ChatThreadDoc,
  DataProfileDoc,
  DataSourceDoc,
  IngestJobDoc,
  KbChunkDoc,
  KbDocumentDoc,
  SourceFileDoc,
} from "./types";
import type { CanonicalRecord } from "./canonical";

/**
 * Every collection the upload → analysis → plan → knowledge-base pipeline writes
 * to, in one place.
 *
 * The names are all `revops_`-prefixed for a specific reason. A v1.0 backend
 * already occupies this database and owns `action_plans`, `revenue_entities`,
 * `workspaces`, and `plugin_connections` — its action plans are keyed by
 * `workspaceId`, ours by `companyId`. A shared, unprefixed name would mean two
 * incompatible documents living in one collection behind one index, discovered
 * later as corrupt reads rather than at write time.
 *
 * So this module is the only place a collection name is spelled. Nothing else
 * may pass a raw string to `db.collection()`, which turns "which collections
 * does the new flow touch?" into a question with one answer.
 *
 * Only the canonical record shape in `lib/data/canonical.ts` was carried over
 * from v1.0 — its field set is a good fit and costs nothing to share. Its
 * storage, schema, and everything else here are new.
 */

export const COLLECTIONS = {
  dataSources: "revops_data_sources",
  sourceFiles: "revops_source_files",
  ingestJobs: "revops_ingest_jobs",
  /** Normalised records. Fresh — deliberately not v1.0's `revenue_entities`. */
  entities: "revops_entities",
  dataProfiles: "revops_data_profiles",
  actionPlans: "revops_action_plans",
  kbDocuments: "revops_kb_documents",
  kbChunks: "revops_kb_chunks",
  /** Saved assistant conversations, with their messages embedded. */
  chatThreads: "revops_chat_threads",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** A normalised row as persisted. */
export type EntityDoc = CanonicalRecord & {
  _id: string;
  companyId: string;
  dataSourceId: string;
  sourceFileId: string;
  rowIndex: number;
  createdAt: string;
};

export async function getDataDb(): Promise<Db> {
  return getDb();
}

/** The upload container. One per upload, holds the file it accepted. */
export function sources(db: Db): Collection<DataSourceDoc> {
  return db.collection<DataSourceDoc>(COLLECTIONS.dataSources);
}

/** The uploaded file's metadata. Bytes live in blob storage, not here. */
export function sourceFiles(db: Db): Collection<SourceFileDoc> {
  return db.collection<SourceFileDoc>(COLLECTIONS.sourceFiles);
}

export function ingestJobs(db: Db): Collection<IngestJobDoc> {
  return db.collection<IngestJobDoc>(COLLECTIONS.ingestJobs);
}

export function entities(db: Db): Collection<EntityDoc> {
  return db.collection<EntityDoc>(COLLECTIONS.entities);
}

export function dataProfiles(db: Db): Collection<DataProfileDoc> {
  return db.collection<DataProfileDoc>(COLLECTIONS.dataProfiles);
}

export function actionPlans(db: Db): Collection<ActionPlanDoc> {
  return db.collection<ActionPlanDoc>(COLLECTIONS.actionPlans);
}

export function kbDocuments(db: Db): Collection<KbDocumentDoc> {
  return db.collection<KbDocumentDoc>(COLLECTIONS.kbDocuments);
}

export function kbChunks(db: Db): Collection<KbChunkDoc> {
  return db.collection<KbChunkDoc>(COLLECTIONS.kbChunks);
}

/** A saved assistant conversation, messages included. */
export function chatThreads(db: Db): Collection<ChatThreadDoc> {
  return db.collection<ChatThreadDoc>(COLLECTIONS.chatThreads);
}

export function newId(): string {
  return new ObjectId().toHexString();
}

/**
 * Every index the pipeline relies on, created once per process.
 *
 * The unique index on `(companyId, sha256)` in `revops_source_files` is what
 * makes a re-upload of the same file idempotent rather than a second copy of the
 * same pipeline metrics. The compound indexes exist so the only queries this
 * code issues are covered — notably `entities` being read per company for the
 * profile, and `kb_chunks` being read per company for retrieval.
 *
 * Called lazily on first use rather than at import time, so importing this
 * module in a test or a build never opens a connection.
 */
let indexesEnsured: Promise<void> | null = null;

export function ensureDataIndexes(): Promise<void> {
  if (!indexesEnsured) {
    indexesEnsured = buildIndexes().catch((err) => {
      indexesEnsured = null;
      throw err;
    });
  }
  return indexesEnsured;
}

async function buildIndexes(): Promise<void> {
  const db = await getDataDb();

  await db.collection(COLLECTIONS.sourceFiles).createIndexes([
    { key: { companyId: 1, createdAt: -1 }, name: "company_recent" },
    { key: { companyId: 1, dataSourceId: 1 }, name: "company_source" },
    // Re-uploading an identical file must not create a second copy.
    { key: { companyId: 1, sha256: 1 }, name: "company_dedupe", unique: true },
    // Retention TTL. `expireAfterSeconds: 0` makes Mongo drop a document 30 days
    // after `deletedAt`; a live document has no `deletedAt`, so it never expires.
    { key: { deletedAt: 1 }, name: "deleted_ttl", expireAfterSeconds: 60 * 60 * 24 * 30 },
  ]);

  await db.collection(COLLECTIONS.dataSources).createIndexes([
    { key: { companyId: 1, createdAt: -1 }, name: "company_recent" },
  ]);

  await db.collection(COLLECTIONS.entities).createIndexes([
    { key: { companyId: 1, dataSourceId: 1, rowIndex: 1 }, name: "company_source_rows" },
  ]);

  await db.collection(COLLECTIONS.dataProfiles).createIndexes([
    { key: { companyId: 1, dataSourceId: 1 }, name: "company_source" },
  ]);

  await db.collection(COLLECTIONS.ingestJobs).createIndexes([
    { key: { companyId: 1, createdAt: -1 }, name: "company_recent" },
  ]);

  await db
    .collection(COLLECTIONS.actionPlans)
    .createIndex({ companyId: 1, version: -1 }, { name: "company_version" });

  await db.collection(COLLECTIONS.kbDocuments).createIndexes([
    { key: { companyId: 1, kind: 1, createdAt: -1 }, name: "company_kind_recent" },
    { key: { deletedAt: 1 }, name: "deleted_ttl", expireAfterSeconds: 60 * 60 * 24 * 30 },
  ]);

  await db.collection(COLLECTIONS.kbChunks).createIndexes([
    { key: { companyId: 1, documentId: 1, chunkIndex: 1 }, name: "company_document" },
    { key: { deletedAt: 1 }, name: "deleted_ttl", expireAfterSeconds: 60 * 60 * 24 * 30 },
  ]);

  // The only conversation query is "this company's threads, newest first".
  await db
    .collection(COLLECTIONS.chatThreads)
    .createIndex({ companyId: 1, updatedAt: -1 }, { name: "company_recent" });
}
