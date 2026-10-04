import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";

import { ApiError, badRequest, notFound, unprocessable } from "../common/api-error";
import { assertCsrf, readJson, readQuery } from "../common/http";
import { CurrentUser } from "../auth/session.interceptor";
import type { UserDoc } from "../auth/user";
import { advanceOnboardingStage, findCompanyByUserId, type CompanyDoc } from "../companies";
import {
  buildConfirmedMapping,
  ingestSheet,
  inspectSheet,
  parseUploadedFile,
  type ConfirmedColumn,
} from "../data/ingest";
import { MAX_UPLOAD_BYTES, validateUpload } from "../data/uploads";
import {
  advanceIngestJob,
  completeIngestJob,
  createDataSource,
  deleteSourceFile,
  failIngestJob,
  findFileByHash,
  listSourceFiles,
  pauseIngestJobForConfirmation,
  readSourceFileBytes,
  saveEntities,
  saveProfile,
  readyProfiles,
  saveSourceFile,
  setDataSourceStatus,
  startIngestJob,
} from "../data/pipeline";
import { getDataDb, sourceFiles } from "../data/store";
import type { SourceFileDoc } from "../data/types";
import {
  analyzeData,
  buildDatasetContext,
  generateDataQuestions,
  QuestionGenerationError,
} from "../agent/analyze";

/** A body plus the status the Next.js handler answered with. */
type Reply = { status: number; body: unknown };

/**
 * The fields of a multer file this handler reads.
 *
 * Declared locally rather than reaching for `Express.Multer.File`: the global
 * augmentation comes from `@types/multer`, which is pulled in through
 * `@nestjs/platform-express` rather than depended on directly, and naming it in
 * `tsconfig.types` to get the namespace would drag in globals for the whole
 * build. Three fields is the whole surface.
 */
type UploadedFile = {
  /** The bytes. `memoryStorage`, so the file is already in memory. */
  buffer: Buffer;
  originalname: string;
  size: number;
};

/**
 * Everything under `/api/company/data-sources`: the two-phase upload, the file
 * list, and the skip.
 */
@Controller("company/data-sources")
export class DataSourcesController {
  /**
   * Upload endpoint, in two phases, on one path.
   *
   * Phase 1 — `multipart/form-data`. Validates the bytes, stores them, parses
   *   them, and returns the proposed column mapping with rows still
   *   un-normalised.
   * Phase 2 — JSON `{ fileId, sheetName, columns }`. Confirms the mapping,
   *   normalises, computes metrics, runs the analysis agent, writes the profile.
   *
   * The split exists because mapping cannot be trusted to inference. `Amount` and
   * `ARR` both look like a value column and mean different things, and a pipeline
   * that guessed would build an action plan on a wrong total with nothing in the
   * output to signal it. Phase 1 ends where a human can still correct it.
   *
   * Errors: 400 invalid_request · 401 unauthenticated · 403 csrf · 404 ·
   *        413 too_large · 422 rejected · 500
   */
  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      /* The memory guard. Without a limit here the process would be asked to
         buffer an unbounded body; the handler re-checks the same number so the
         size-specific 413 message survives. */
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async ingest(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @UploadedFile() file: UploadedFile | undefined,
    @CurrentUser() user: UserDoc,
  ) {
    assertCsrf(request);

    const company = await findCompanyByUserId(user._id);
    if (!company) {
      throw notFound("no_company", "Finish your company profile before uploading data.");
    }

    try {
      /* multer inspects the content type and calls `next()` untouched for
         anything that is not `multipart/form-data`, so the phase-2 body arrives
         already parsed by `express.json()` and `file` is undefined. One
         interceptor serves both phases. `memoryStorage` is what the original
         `request.formData()` provided — the whole file in memory — and those
         bytes go straight to validation and hashing. */
      const reply = isMultipart(request)
        ? await this.handleUpload(file, company, user._id)
        : await this.handleConfirm(await readJson(request), company, user._id);

      /* One path serves both phases, and the two phases answer with different
         statuses (201 for a newly stored file, 200 for a reuse or a
         confirmation), so the status travels with the body rather than being
         fixed by the `@Post()` default. */
      response.status(reply.status);
      return reply.body;
    } catch (error: unknown) {
      /* Never surface the underlying error — these strings are shown to users,
         and a stack trace or driver message is both noise and a small leak. */
      console.error("data-sources: request failed", error instanceof Error ? error.message : error);
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "internal_error",
        "Something went wrong processing that file. Please try again.",
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phase 1 — upload                                                    */
  /* ------------------------------------------------------------------ */

  private async handleUpload(
    upload: UploadedFile | undefined,
    company: CompanyDoc,
    userId: string,
  ): Promise<Reply> {
    if (!upload) {
      throw badRequest("invalid_request", "No file was included in that upload.");
    }
    if (upload.size > MAX_UPLOAD_BYTES) throw tooLarge(upload.size);

    const bytes = upload.buffer;

    /* Validation runs before anything is stored, so a rejected file never
       reaches the container. Signature, not filename, decides. */
    const validation = validateUpload(upload.originalname, bytes);
    if (!validation.ok) {
      throw unprocessable(
        validation.reason,
        validation.detail ?? "That file couldn't be read. Accepted formats: .csv, .tsv, or .xlsx.",
      );
    }

    const parsed = parseUploadedFile(bytes, validation.extension, upload.originalname);
    if (!parsed.ok) {
      throw unprocessable(parsed.reason, parsed.detail ?? "That file couldn't be read.");
    }

    const inspected = inspectSheet(parsed.sheets);
    if (!inspected.ok) {
      throw unprocessable(inspected.reason, inspected.detail ?? "That file had no usable rows.");
    }

    /* The stage moves only once the bytes are known to be usable. Advancing on
       arrival instead would strand a company in `analyzing` when the real
       outcome was "that file was rejected" — a stuck stage with no pipeline
       behind it. */
    await advanceOnboardingStage(userId, "company_saved", "awaiting_data");
    await advanceOnboardingStage(userId, "awaiting_data", "analyzing");

    /* Identical re-upload returns the existing file rather than storing a second
       copy, so a user retrying after a failed confirmation isn't told their file
       is invalid. The response is the full inspection payload either way — a
       partial one would leave the client with no mapping to show. */
    const existing = await findFileByHash(company._id, validation.sha256);
    if (existing) {
      return {
        status: HttpStatus.OK,
        body: inspectionPayload(
          existing._id,
          existing.dataSourceId,
          existing.originalName,
          inspected,
          true,
        ),
      };
    }

    const dataSource = await createDataSource(company._id);
    const job = await startIngestJob(company._id, dataSource._id);

    try {
      const file = await saveSourceFile({
        companyId: company._id,
        dataSourceId: dataSource._id,
        originalName: upload.originalname,
        extension: validation.extension,
        mimeType: validation.mimeType,
        sizeBytes: validation.sizeBytes,
        sha256: validation.sha256,
        bytes,
      });

      await pauseIngestJobForConfirmation(company._id, job._id);
      await setDataSourceStatus(company._id, dataSource._id, "awaiting_confirmation");

      return {
        status: HttpStatus.CREATED,
        body: inspectionPayload(file._id, dataSource._id, file.originalName, inspected, false),
      };
    } catch (error: unknown) {
      await failIngestJob(company._id, job._id, {
        code: "upload_failed",
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phase 2 — confirm mapping, then analyse                             */
  /* ------------------------------------------------------------------ */

  private async handleConfirm(
    body: {
      fileId?: unknown;
      sheetName?: unknown;
      columns?: unknown;
      inspect?: unknown;
    },
    company: CompanyDoc,
    userId: string,
  ): Promise<Reply> {
    if (typeof body.fileId !== "string" || body.fileId.length === 0) {
      throw badRequest("invalid_request", "A file id is required.");
    }

    const file = await findFile(company._id, body.fileId);
    if (!file) throw notFound("not_found", "That upload couldn't be found.");

    const bytes = await readSourceFileBytes(file);
    const parsed = parseUploadedFile(bytes, file.extension, file.originalName);
    if (!parsed.ok) {
      throw unprocessable(parsed.reason, parsed.detail ?? "That file couldn't be read.");
    }

    const inspected = inspectSheet(
      parsed.sheets,
      typeof body.sheetName === "string" ? body.sheetName : undefined,
    );
    if (!inspected.ok) {
      throw unprocessable(inspected.reason, inspected.detail ?? "That sheet had no usable rows.");
    }

    /* Inspect-only: the user picked a different sheet and needs that sheet's
       headers and proposals before they can confirm anything. Nothing is
       written, no job is started, and the onboarding stage is left alone — this
       is a re-read of an upload that already exists, not new work. */
    if (body.inspect === true) {
      return {
        status: HttpStatus.OK,
        body: inspectionPayload(file._id, file.dataSourceId, file.originalName, inspected, true),
      };
    }

    const columns = Array.isArray(body.columns) ? (body.columns as ConfirmedColumn[]) : [];
    const confirmed = buildConfirmedMapping(inspected.sheet.headers, columns);
    if (!confirmed.ok) throw unprocessable("unmappable_columns", confirmed.message);

    /* Reached directly — a page reload between upload and confirmation — so the
       stage may still be `company_saved`. Both calls are guarded no-ops when the
       company is already where it needs to be. */
    await advanceOnboardingStage(userId, "company_saved", "awaiting_data");
    await advanceOnboardingStage(userId, "awaiting_data", "analyzing");

    const job = await startIngestJob(company._id, file.dataSourceId);

    try {
      await setDataSourceStatus(company._id, file.dataSourceId, "normalizing");
      await advanceIngestJob(company._id, job._id, "normalizing", 55);

      const ingested = ingestSheet(inspected.sheet, confirmed.mapping, confirmed.entityType);
      if (!ingested.ok) {
        await setDataSourceStatus(company._id, file.dataSourceId, "invalid");
        throw unprocessable(ingested.reason, ingested.detail ?? "No usable rows were found.");
      }

      await setDataSourceStatus(company._id, file.dataSourceId, "profiling");
      await advanceIngestJob(company._id, job._id, "profiling", 70);

      const written = await saveEntities({
        companyId: company._id,
        dataSourceId: file.dataSourceId,
        sourceFileId: file._id,
        records: ingested.records,
      });

      /* The analysis agent receives `ingested.metrics` and nothing else — stage
         names and counts, never a deal name or an amount. The file name is
         passed so it can tell a marketing spend sheet from a pipeline export:
         without it every report is analysed as a pipeline and the gaps it names
         are the wrong ones. */
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

      /* Grounded on every report uploaded so far, not just this one. The uploader
         queues several files, and returning questions built from only the last
         confirmation would drop the earlier reports the moment they were
         analysed. */
      const context = buildDatasetContext(await readyProfiles(company._id));
      let questions: string[] = [];
      let questionsError: string | null = null;
      try {
        questions = await generateDataQuestions(company, context, 5);
      } catch (error: unknown) {
        if (!(error instanceof QuestionGenerationError)) throw error;
        /* The data is analysed and saved regardless. Losing the questions is
           recoverable — the questions screen regenerates them from the same
           stored context — so this is reported, not thrown. */
        questionsError = error.message;
      }

      /* Pipeline finished successfully — the questions step is next. */
      await advanceOnboardingStage(userId, "analyzing", "questions");

      /* The upload itself succeeded, so this is a 200 even when only the question
         step failed. Reporting 5xx here would make the client discard a
         completed ingest and ask the user to re-upload a file already analysed. */
      return {
        status: HttpStatus.OK,
        body: {
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
      };
    } catch (error: unknown) {
      await failIngestJob(company._id, job._id, {
        code: "analysis_failed",
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /* File list                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Lists this company's uploaded files. `GET` is safe so it needs no CSRF token.
   *
   * Only filename, size, and hash are returned. `blobPath` is deliberately
   * omitted: it is a storage locator, and a client that never sees it cannot be
   * used to probe for another company's blobs.
   *
   * A company with no record answers `200 { files: [] }` rather than a 404. The
   * list is also what drives the delete buttons on the data screen, and an
   * absent company is the empty state there, not a failure.
   */
  @Get("list")
  async list(@CurrentUser("Your session has expired.") user: UserDoc) {
    const company = await findCompanyByUserId(user._id);
    if (!company) return { files: [] };

    const files = await listSourceFiles(company._id);
    return {
      files: files.map((file) => ({
        id: file._id,
        name: file.originalName,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        rowCount: file.rowCount ?? null,
        status: file.status,
        createdAt: file.createdAt,
      })),
    };
  }

  /** Removes an uploaded file. State-changing, so it needs the CSRF token. */
  @Delete("list")
  async remove(@Req() request: Request, @CurrentUser("Your session has expired.") user: UserDoc) {
    assertCsrf(request, "Session token missing or invalid.");

    const company = await findCompanyByUserId(user._id);
    if (!company) throw notFound("not_found", "No company found.");

    const id = readQuery(request).id;
    if (!id) throw badRequest("invalid_request", "A file id is required.");

    const deleted = await deleteSourceFile(company._id, id);
    if (!deleted) throw notFound("not_found", "That file wasn't found.");

    return { deleted: true };
  }

  /* ------------------------------------------------------------------ */
  /* Skip                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Skips the upload step.
   *
   * Skipping is a first-class outcome, not a failure, and it is recorded rather
   * than left to a client-side navigation: `ONBOARDING_TRANSITIONS` allows
   * `awaiting_data -> questions` precisely so a company with no data has a real,
   * auditable path through onboarding instead of one that only exists in the UI.
   * Without this the company stays in `company_saved` and the stage record claims
   * work that never happened.
   *
   * Returns the questions for the next screen so the page can render from the
   * same response rather than fetching them again.
   *
   * Errors: 401 unauthenticated · 403 csrf · 404 · 500
   */
  @Post("skip")
  async skip(@Req() request: Request, @CurrentUser("Your session has expired.") user: UserDoc) {
    assertCsrf(request, "Session token missing or invalid.");

    const company = await findCompanyByUserId(user._id);
    if (!company) throw notFound("no_company", "Finish your company profile first.");

    try {
      /* Reach `awaiting_data` first if the company never got there, then take the
         skip edge. Both calls are conditional no-ops when already in the stage,
         so skipping twice is safe. */
      await advanceOnboardingStage(user._id, "company_saved", "awaiting_data");
      await advanceOnboardingStage(user._id, "awaiting_data", "questions");

      /* A profile may still exist — the user can upload a file, skip the
         questions, and come back. Honour it so a skip never discards work
         already done, and ground the questions on all of it rather than the
         newest file. */
      const context = buildDatasetContext(await readyProfiles(company._id));
      const questions = await generateDataQuestions(company, context, 5);

      return { skipped: true, questions };
    } catch (error: unknown) {
      /* The skip itself is recorded and reversible; only the questions failed.
         Distinct code so the client can offer a retry without implying the skip
         was rolled back. */
      if (error instanceof QuestionGenerationError) {
        throw new ApiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "questions_unavailable",
          error.message,
        );
      }
      console.error("data-sources/skip: failed", error instanceof Error ? error.message : error);
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "internal_error",
        "Couldn't skip that step. Please try again.",
      );
    }
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

function isMultipart(request: Request): boolean {
  return (request.headers["content-type"] ?? "").includes("multipart/form-data");
}

/** Tenant-scoped lookup — the company id is part of the filter, not implied. */
async function findFile(companyId: string, fileId: string): Promise<SourceFileDoc | null> {
  const db = await getDataDb();
  return sourceFiles(db).findOne({ _id: fileId, companyId, deletedAt: { $exists: false } });
}

/**
 * The 413 for an oversized upload.
 *
 * multer's `limits.fileSize` trips first and aborts the stream, so on that path
 * the real byte count was never accumulated and the message can only name the
 * limit. The handler's own `upload.size` check produces the original wording; the
 * interceptor produces the fallback, and `api-error.ts` answers the same
 * `too_large` code for the limiter itself. The client branches on the code.
 */
function tooLarge(sizeBytes?: number): ApiError {
  const limitMb = MAX_UPLOAD_BYTES / 1024 / 1024;
  const message =
    sizeBytes === undefined
      ? `That file is over the ${limitMb} MB limit.`
      : `That file is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. The limit is ${limitMb} MB.`;
  return new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, "too_large", message);
}
