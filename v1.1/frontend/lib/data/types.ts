/**
 * Document shapes for the data-source, ingestion, action-plan, and knowledge
 * base collections. Mirrors `lib/companies.ts`: string `_id`, ISO-string
 * timestamps, `type` over `interface`.
 *
 * Every collection is keyed by `companyId` (→ `companies._id`) rather than
 * `userId`. The current model is 1 user = 1 company, but auth belongs to an
 * organisation, not a person — an agency or a second admin must be able to share
 * one set of data sources. Retrofitting that after secrets exist means migrating
 * them, so the key is chosen correctly now.
 *
 * Collection *names* live in `lib/data/store.ts`, which prefixes them `revops_`
 * so they cannot collide with the v1.0 backend sharing this database.
 */

/* -------------------------------------------------------------------------- */
/* Onboarding funnel                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Explicit progress through the funnel. Previously the app inferred position
 * from the presence of `companies.assessment`, which cannot represent "user is
 * looking at the upload screen" or "an ingest job is still running" — both of
 * which are states the UI has to survive a refresh in.
 *
 * `awaiting_data` is the only stage that offers a skip; skipping moves to
 * `questions` with no data-source context attached.
 */
export type OnboardingStage =
  | "company_saved" // company form submitted, nothing else done
  | "awaiting_data" // upload screen — skippable
  | "analyzing" // ingest job running (upload validating/parsing/profiling)
  | "questions" // generating or answering questions
  | "plan_ready"; // action plan exists — chat unlocked

/** Legal moves. Anything else is a client bug or a replay and is rejected. */
export const ONBOARDING_TRANSITIONS: Readonly<Record<OnboardingStage, readonly OnboardingStage[]>> =
  {
    company_saved: ["awaiting_data", "questions"],
    awaiting_data: ["analyzing", "questions"],
    analyzing: ["questions"],
    questions: ["plan_ready", "questions"],
    plan_ready: [],
  };

export function canTransition(from: OnboardingStage, to: OnboardingStage): boolean {
  return ONBOARDING_TRANSITIONS[from].includes(to);
}

/* -------------------------------------------------------------------------- */
/* data_sources                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One source of company data.
 *
 * Only `file_upload` exists. An earlier draft reserved `hubspot` / `salesforce`
 * / `zoho` here on the theory that a connector would slot in later; those
 * variants carried provider fields, token envelopes, and a consent model that
 * nothing implements, so the type advertised a security surface the product did
 * not have. A real connector needs its own design, and it gets added when it is
 * actually built.
 */
export type DataSourceKind = "file_upload";

export type DataSourceStatus =
  | "pending"
  | "parsing"
  | "normalizing"
  | "profiling"
  | "awaiting_confirmation"
  | "ready"
  | "invalid"
  | "error";

export type DataSourceDoc = {
  _id: string;
  companyId: string;
  kind: DataSourceKind;
  status: DataSourceStatus;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string; at: string };
};

/* -------------------------------------------------------------------------- */
/* source_files                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Formats we can actually parse.
 *
 * `.xls` is absent deliberately: it is the pre-2007 OLE2 binary format, not a
 * ZIP of XML, and `lib/data/xlsx.ts` does not read it. Accepting it and then
 * failing to extract rows would tell a user their file was uploaded successfully
 * and then show them an empty analysis.
 */
export type AllowedExtension = "csv" | "tsv" | "xlsx";

/**
 * Why a file was refused. Every value is a decision the user will be shown, so
 * none of them may leak server internals.
 */
export type RejectReason =
  | "executable_signature"
  | "unsupported_type"
  | "too_large"
  | "empty"
  | "password_protected"
  | "macro_enabled"
  | "unmappable_columns"
  | "signature_mismatch"
  | "corrupt_workbook";

export type SourceFileStatus = "pending" | "parsing" | "ready" | "rejected" | "error";

export type SourceFileDoc = {
  _id: string;
  companyId: string;
  dataSourceId: string;
  originalName: string;
  extension: AllowedExtension;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 of the raw bytes, for dedupe and integrity re-checks. */
  sha256: string;
  /** Azure Blob path. File bytes are never stored in MongoDB. */
  blobPath: string;
  /** Which sheet of a multi-sheet workbook the user selected. */
  sheetName?: string;
  rowCount?: number;
  /** Original column name → canonical field, as confirmed by the user. */
  headerMap?: Record<string, string>;
  status: SourceFileStatus;
  rejectedReason?: RejectReason;
  createdAt: string;
  /** Set to start the 30-day retention TTL; a live document must not have it. */
  deletedAt?: string;
};

/* -------------------------------------------------------------------------- */
/* ingest_jobs                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `awaiting_confirmation` is distinct from `running` on purpose: a pipeline
 * paused on a human is not a pipeline in progress, and a job list that claims
 * otherwise would report work that never happened.
 */
export type IngestState =
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export type IngestStep =
  | "validating"
  | "parsing"
  | "awaiting_confirmation"
  | "normalizing"
  | "profiling"
  | "generating_questions"
  | "complete";

export type IngestJobDoc = {
  _id: string;
  companyId: string;
  dataSourceId?: string;
  kind: "upload" | "resync";
  state: IngestState;
  step: IngestStep;
  progress: number;
  attempts: number;
  error?: { code: string; message: string; at: string };
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* data_profiles                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The output of the analysis agent, split along a hard line.
 *
 * `metrics` is arithmetic performed by our own code over normalised rows. The
 * model never contributes a number to this object, so a hallucinated figure
 * cannot reach it. `summary`, `semanticGaps`, and `warnings` are the model's,
 * grounded on `metrics` and never on raw rows — the analysis agent is given
 * stage names and counts, not deal names or amounts.
 */
export type DataProfileDoc = {
  _id: string;
  companyId: string;
  dataSourceId: string;
  sourceFileId: string;

  metrics: {
    totalRecords: number;
    dateRange: { from: string; to: string } | null;
    amountSum: number;
    currency: string | null;
    stageCounts: Record<string, number>;
    nullCounts: Record<string, number>;
    duplicateCount: number;
    staleRecordCount: number;
  };

  /** Model-authored. May restate a metric, never a raw row. */
  summary: string;
  semanticGaps: string[];
  warnings: string[];
  /** True when the engine was unreachable and this came from metrics alone. */
  degraded: boolean;
  rowCount: number;
  model: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* action_plans                                                               */
/* -------------------------------------------------------------------------- */

export type Priority = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";

export type ActionPlanAction = {
  id: string;
  title: string;
  rationale: string;
  priority: Priority;
  effort: Effort;
  owner: string;
  dueDays: number;
  /** The number the user watches to know whether this worked. */
  metric: string;
  expectedImpact: string;
};

export type ActionPlanDoc = {
  _id: string;
  companyId: string;
  /** Regenerating keeps history rather than overwriting the prior plan. */
  version: number;
  status: "draft" | "final";
  questions: string[];
  answers: string[];
  /** Sources whose profile grounded this plan. Empty when upload was skipped. */
  dataSourceIds: string[];
  profileSummary?: string;
  diagnosis: string;
  actions: ActionPlanAction[];
  projectedImpact: { summary: string };
  /** Present only once the plan has been redacted, chunked, and indexed. */
  kb?: { documentId: string; chunkIds: string[]; indexedAt: string };
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Knowledge base                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What may be indexed. Narrowed to `action_plan` because that is what the user
 * asked the knowledge base to hold; `data_profile` was removed rather than
 * merely unused, so adding it back is a deliberate decision with a diff.
 */
export type KbDocumentKind = "action_plan";

/**
 * Scope is deliberately a closed union with no `"global"` member. Cross-tenant
 * learning needs an explicit redesign — k-anonymity thresholds, an opt-in, and
 * field-level stripping — not a string someone types into a filter. Adding it
 * later is cheap; auditing for leaked documents written under it is not.
 */
export type KbScope = "company";

export type KbDocumentDoc = {
  _id: string;
  companyId: string;
  scope: KbScope;
  kind: KbDocumentKind;
  title: string;
  /** → `action_plans._id` or `data_profiles._id`. */
  sourceId?: string;
  /** Redacted plain text. See `lib/security/redact`. */
  text: string;
  tokenCount: number;
  /** True only for cross-tenant-eligible text; never true under `KbScope`. */
  anonymized: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type KbChunkDoc = {
  _id: string;
  documentId: string;
  companyId: string;
  scope: KbScope;
  chunkIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  /**
   * Optional. A per-company knowledge base is a few hundred chunks, which is
   * brute-forceable in-process; leave unset until cross-tenant retrieval makes
   * a real vector index worth the operational cost.
   */
  embedding?: number[];
  embeddingModel?: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* chat_threads                                                               */
/* -------------------------------------------------------------------------- */

/** One turn of a saved conversation. */
export type ChatMessageDoc = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

/**
 * A saved assistant conversation.
 *
 * Messages are embedded rather than kept in a child collection because a thread
 * is read whole, written only by appending, and deleted as a unit — there is no
 * query that wants one message without its conversation. Embedding keeps the
 * tenant filter on the single document being fetched and makes "record the
 * answer" one atomic `$push` instead of a write that can be orphaned between two
 * collections. `MAX_THREAD_MESSAGES` in `lib/data/chat.ts` bounds the array so a
 * long-lived thread cannot grow towards Mongo's document limit.
 */
export type ChatThreadDoc = {
  _id: string;
  companyId: string;
  /** Derived from the first question the user typed. Shown in the recent list. */
  title: string;
  messages: ChatMessageDoc[];
  createdAt: string;
  updatedAt: string;
};
