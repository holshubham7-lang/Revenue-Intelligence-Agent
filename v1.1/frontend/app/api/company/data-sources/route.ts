import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { csrfPasses } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { advanceOnboardingStage, findCompanyByUserId, type CompanyDoc } from "@/lib/companies";
import {
  buildConfirmedMapping,
  ingestSheet,
  inspectSheet,
  parseUploadedFile,
  type ConfirmedColumn,
} from "@/lib/data/ingest";
import { MAX_UPLOAD_BYTES, validateUpload } from "@/lib/data/uploads";
import {
  advanceIngestJob,
  completeIngestJob,
  createDataSource,
  failIngestJob,
  findFileByHash,
  pauseIngestJobForConfirmation,
  readSourceFileBytes,
  saveEntities,
  saveProfile,
  readyProfiles,
  saveSourceFile,
  setDataSourceStatus,
  startIngestJob,
} from "@/lib/data/pipeline";
import { getDataDb, sourceFiles } from "@/lib/data/store";
import {
  analyzeData,
  buildDatasetContext,
  generateDataQuestions,
  QuestionGenerationError,
} from "@/lib/agent/analyze";
import type { SourceFileDoc } from "@/lib/data/types";

export const runtime = "nodejs";

/**
 * Upload endpoint, in two phases.
 *
 * Phase 1 — `multipart/form-data`. Validates the bytes, stores them, parses them,
 *   and returns the proposed column mapping with rows still un-normalised.
 *
 * Phase 2 — JSON `{ fileId, sheetName, columns }`. Confirms the mapping,
 *   normalises, computes metrics, runs the analysis agent, writes the profile.
 *
 * The split exists because mapping cannot be trusted to inference. `Amount` and
 * `ARR` both look like a value column and mean different things, and a pipeline
 * that guessed would build an action plan on a wrong total with nothing in the
 * output to signal it. Phase 1 ends where a human can still correct it.
 *
 * Errors: 400 invalid_request · 401 unauthenticated · 403 csrf · 404 ·
 *         413 too_large · 422 rejected · 500
 */

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  if (!csrfPasses(request)) {
    return errorResponse(403, "csrf_failed", "Session token missing or invalid. Refresh the page and try again.");
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);
  if (!user) {
    return errorResponse(401, "unauthenticated", "Your session has expired. Sign in again to continue.");
  }

  const company = await findCompanyByUserId(user._id);
  if (!company) {
    return errorResponse(404, "no_company", "Finish your company profile before uploading data.");
  }

  const isMultipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");

  try {
    return isMultipart ? await handleUpload(request, company, user._id) : await handleConfirm(request, company, user._id);
  } catch (err) {
    // Never surface the underlying error — these strings are shown to users, and
    // a stack trace or driver message is both noise and a small leak.
    console.error("data-sources: request failed", err instanceof Error ? err.message : err);
    return errorResponse(500, "internal_error", "Something went wrong processing that file. Please try again.");
  }
}

/* -------------------------------------------------------------------------- */
/* Phase 1 — upload                                                           */
/* -------------------------------------------------------------------------- */

async function handleUpload(request: NextRequest, company: CompanyDoc, userId: string) {
  const form = await request.formData();
  const upload = form.get("file");

  if (!(upload instanceof File)) {
    return errorResponse(400, "invalid_request", "No file was included in that upload.");
  }

  if (upload.size > MAX_UPLOAD_BYTES) {
    return errorResponse(
      413,
      "too_large",
      `That file is ${(upload.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  const bytes = Buffer.from(await upload.arrayBuffer());

  // Validation runs before anything is stored, so a rejected file never reaches
  // the container. Signature, not filename, decides.
  const validation = validateUpload(upload.name, bytes);
  if (!validation.ok) {
    return errorResponse(
      422,
      validation.reason,
      validation.detail ?? "That file couldn't be read. Accepted formats: .csv, .tsv, or .xlsx.",
    );
  }

  const parsed = parseUploadedFile(bytes, validation.extension, upload.name);
  if (!parsed.ok) {
    return errorResponse(422, parsed.reason, parsed.detail ?? "That file couldn't be read.");
  }

  const inspected = inspectSheet(parsed.sheets);
  if (!inspected.ok) {
    return errorResponse(422, inspected.reason, inspected.detail ?? "That file had no usable rows.");
  }

  // The stage moves only once the bytes are known to be usable. Advancing on
  // arrival instead would strand a company in `analyzing` when the real outcome
  // was "that file was rejected" — a stuck stage with no pipeline behind it.
  await advanceOnboardingStage(userId, "company_saved", "awaiting_data");
  await advanceOnboardingStage(userId, "awaiting_data", "analyzing");

  // Identical re-upload returns the existing file rather than storing a second
  // copy, so a user retrying after a failed confirmation isn't told their file
  // is invalid. The response is the full inspection payload either way — a
  // partial one would leave the client with no mapping to show.
  const existing = await findFileByHash(company._id, validation.sha256);
  if (existing) {
    return NextResponse.json(inspectionPayload(existing._id, existing.dataSourceId, existing.originalName, inspected, true), {
      status: 200,
    });
  }

  const dataSource = await createDataSource(company._id);
  const job = await startIngestJob(company._id, dataSource._id);

  try {
    const file = await saveSourceFile({
      companyId: company._id,
      dataSourceId: dataSource._id,
      originalName: upload.name,
      extension: validation.extension,
      mimeType: validation.mimeType,
      sizeBytes: validation.sizeBytes,
      sha256: validation.sha256,
      bytes,
    });

    await pauseIngestJobForConfirmation(company._id, job._id);
    await setDataSourceStatus(company._id, dataSource._id, "awaiting_confirmation");

    return NextResponse.json(
      inspectionPayload(file._id, dataSource._id, file.originalName, inspected, false),
      { status: 201 },
    );
  } catch (err) {
    await failIngestJob(company._id, job._id, {
      code: "upload_failed",
      message: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

/**
 * The phase-1 response, identical whether the file was just stored or was a
 * byte-identical re-upload. The client has one code path for "here is your file
 * to confirm", which is the only way it can be correct for both.
 */
function inspectionPayload(
  fileId: string,
  dataSourceId: string,
  fileName: string,
  inspected: Extract<ReturnType<typeof inspectSheet>, { ok: true }>,
  reused: boolean,
) {
  return {
    fileId,
    dataSourceId,
    fileName,
    reused,
    sheetNames: inspected.sheetNames,
    sheetName: inspected.sheet.name,
    rowCount: inspected.rowCount,
    mapping: {
      entityType: inspected.mapping.entityType,
      columns: inspected.mapping.columns,
      missing: inspected.mapping.missing,
      mappable: inspected.mapping.mappable,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Phase 2 — confirm mapping, then analyse                                    */
/* -------------------------------------------------------------------------- */

async function handleConfirm(request: NextRequest, company: CompanyDoc, userId: string) {
  let body: { fileId?: unknown; sheetName?: unknown; columns?: unknown; inspect?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(400, "invalid_request", "Invalid request body.");
  }

  if (typeof body.fileId !== "string" || body.fileId.length === 0) {
    return errorResponse(400, "invalid_request", "A file id is required.");
  }

  const file = await findFile(company._id, body.fileId);
  if (!file) {
    return errorResponse(404, "not_found", "That upload couldn't be found.");
  }

  const bytes = await readSourceFileBytes(file);
  const parsed = parseUploadedFile(bytes, file.extension, file.originalName);
  if (!parsed.ok) {
    return errorResponse(422, parsed.reason, parsed.detail ?? "That file couldn't be read.");
  }

  const inspected = inspectSheet(
    parsed.sheets,
    typeof body.sheetName === "string" ? body.sheetName : undefined,
  );
  if (!inspected.ok) {
    return errorResponse(422, inspected.reason, inspected.detail ?? "That sheet had no usable rows.");
  }

  // Inspect-only: the user picked a different sheet and needs that sheet's
  // headers and proposals before they can confirm anything. Nothing is written,
  // no job is started, and the onboarding stage is left alone — this is a
  // re-read of an upload that already exists, not new work.
  if (body.inspect === true) {
    return NextResponse.json(
      inspectionPayload(file._id, file.dataSourceId, file.originalName, inspected, true),
      { status: 200 },
    );
  }

  const columns = Array.isArray(body.columns) ? (body.columns as ConfirmedColumn[]) : [];
  const confirmed = buildConfirmedMapping(inspected.sheet.headers, columns);
  if (!confirmed.ok) {
    return errorResponse(422, "unmappable_columns", confirmed.message);
  }

  // Reached directly — a page reload between upload and confirmation — so the
  // stage may still be `company_saved`. Both calls are guarded no-ops when the
  // company is already where it needs to be.
  await advanceOnboardingStage(userId, "company_saved", "awaiting_data");
  await advanceOnboardingStage(userId, "awaiting_data", "analyzing");

  const job = await startIngestJob(company._id, file.dataSourceId);

  try {
    await setDataSourceStatus(company._id, file.dataSourceId, "normalizing");
    await advanceIngestJob(company._id, job._id, "normalizing", 55);

    const ingested = ingestSheet(inspected.sheet, confirmed.mapping, confirmed.entityType);
    if (!ingested.ok) {
      await setDataSourceStatus(company._id, file.dataSourceId, "invalid");
      return errorResponse(422, ingested.reason, ingested.detail ?? "No usable rows were found.");
    }

    await setDataSourceStatus(company._id, file.dataSourceId, "profiling");
    await advanceIngestJob(company._id, job._id, "profiling", 70);

    const written = await saveEntities({
      companyId: company._id,
      dataSourceId: file.dataSourceId,
      sourceFileId: file._id,
      records: ingested.records,
    });

    // The analysis agent receives `ingested.metrics` and nothing else — stage
    // names and counts, never a deal name or an amount. The file name is passed
    // so it can tell a marketing spend sheet from a pipeline export: without it
    // every report is analysed as a pipeline and the gaps it names are the wrong
    // ones.
    const analysis = await analyzeData(
      company,
      ingested.metrics,
      new Date().toISOString().slice(0, 10),
      file.originalName,
    );

    const profile = await saveProfile({
      companyId: company._id,
      dataSourceId: file.dataSourceId,
      sourceFileId: file._id,
      metrics: ingested.metrics,
      analysis,
      rowCount: ingested.records.length,
    });

    await setDataSourceStatus(company._id, file.dataSourceId, "ready");
    await completeIngestJob(company._id, job._id);

    // Grounded on every report uploaded so far, not just this one. The uploader
    // queues several files, and returning questions built from only the last
    // confirmation would drop the earlier reports the moment they were analysed.
    const context = buildDatasetContext(await readyProfiles(company._id));
    let questions: string[] = [];
    let questionsError: string | null = null;
    try {
      questions = await generateDataQuestions(company, context, 5);
    } catch (err) {
      if (!(err instanceof QuestionGenerationError)) throw err;
      // The data is analysed and saved regardless. Losing the questions is
      // recoverable — the questions screen regenerates them from the same stored
      // context — so this is reported, not thrown.
      questionsError = err.message;
    }

    // Pipeline finished successfully — the questions step is next.
    await advanceOnboardingStage(userId, "analyzing", "questions");

    return NextResponse.json(
      {
        fileId: file._id,
        dataSourceId: file.dataSourceId,
        rows: written,
        skipped: ingested.skipped,
        metrics: profile.metrics,
        summary: profile.summary,
        semanticGaps: profile.semanticGaps,
        warnings: profile.warnings,
        degraded: profile.degraded,
        questions,
        questionsError,
        dataset: {
          fileCount: context.files.length,
          fileNames: context.files.map((entry) => entry.fileName),
          valid: context.valid,
          blockers: [...context.blockers],
          caveats: [...context.caveats],
        },
      },
      // The upload itself succeeded, so this is a 200 even when only the
      // question step failed. Reporting 5xx here would make the client discard a
      // completed ingest and ask the user to re-upload a file already analysed.
      { status: 200 },
    );
  } catch (err) {
    await failIngestJob(company._id, job._id, {
      code: "analysis_failed",
      message: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

/** Tenant-scoped lookup — the company id is part of the filter, not implied. */
async function findFile(companyId: string, fileId: string): Promise<SourceFileDoc | null> {
  const db = await getDataDb();
  return sourceFiles(db).findOne({ _id: fileId, companyId, deletedAt: { $exists: false } });
}
