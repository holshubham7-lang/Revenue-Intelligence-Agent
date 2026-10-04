import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/** The single error envelope every route returns: `{ error: { code, message, fields? } }`. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
};

/**
 * The only way a controller reports a failure.
 *
 * Controllers `throw` instead of building a response, so the envelope cannot
 * drift between routes. `fields` is set only for validation failures, which is
 * exactly when the previous hand-written responses included it.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super({ code, message, ...(fields ? { fields } : {}) }, status);
  }

  /** The envelope, so the filter does not have to reach back into the exception. */
  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.fields ? { fields: this.fields } : {}) } };
  }
}

export const badRequest = (code: string, message: string) => new ApiError(HttpStatus.BAD_REQUEST, code, message);
export const unauthorized = (code: string, message: string) => new ApiError(HttpStatus.UNAUTHORIZED, code, message);
export const forbidden = (code: string, message: string) => new ApiError(HttpStatus.FORBIDDEN, code, message);
export const notFound = (code: string, message: string) => new ApiError(HttpStatus.NOT_FOUND, code, message);
export const conflict = (code: string, message: string) => new ApiError(HttpStatus.CONFLICT, code, message);
export const unprocessable = (code: string, message: string, fields?: Record<string, string>) =>
  new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, fields);
export const internal = (message: string) => new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", message);

/** The one place a CSRF mismatch becomes a 403. */
export const csrfFailed = () =>
  forbidden("csrf_failed", "Session token missing or invalid. Refresh the page and try again.");

/** The one place an unparseable JSON body becomes a 400. */
export const invalidJson = () => badRequest("invalid_json", "Invalid request body.");

/**
 * Normalises every thrown error into the envelope above.
 *
 * An `ApiError` already carries its own envelope. Any other `HttpException`
 * (thrown by Nest internals, e.g. the 404 handler for an unrouted path) is
 * mapped by status. Anything else is an unexpected fault: logged with its stack
 * server-side, answered with a generic message, so a Mongo error string or a
 * stack frame never reaches the browser.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    if (exception instanceof ApiError) {
      response.status(exception.getStatus()).json(exception.toBody());
      return;
    }

    /* body-parser's malformed-JSON and oversized-body failures.
     *
     * Nest re-wraps a parser error as `BadRequestException`/`PayloadTooLargeException`
     * and keeps the original in `cause`, so the check unwraps one level. Without
     * this the endpoint answers
     `{ error: { code: "bad_request", message: "Expected property name or '}' in
     JSON at position 1" } }` where the Next.js route handlers answered
     `{ error: { code: "invalid_json", message: "Invalid request body." } }`.
     * Same status, so nothing crashed, but the code changed and the message
     * reflects the raw request back to the caller.
     *
     * Handled here rather than by replacing the parser, so the contract holds no
     * matter which error the framework surfaces around it. */
    const parseFailure = findBodyParseFailure(exception);
    if (parseFailure) {
      const tooLarge = parseFailure.type === "entity.too.large" || parseFailure.status === 413;
      response.status(tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST).json({
        error: tooLarge
          ? { code: "payload_too_large", message: "That upload is too large to process." }
          : { code: "invalid_json", message: "Invalid request body." },
      });
      return;
    }

    /* multer's `limits.fileSize`, tripped inside `FileInterceptor` before the
     * handler ever ran.
     *
     * This arrives as a bare `MulterError`, which matches nothing above, so it
     * fell through to the generic branch and answered `500 internal_error` —
     * telling the user the upload crashed the server when in fact it was simply
     * too big and was refused. The client branches on `too_large`, which is what
     * the Next.js handler answered with, so this has to reach the same code. */
    const uploadLimit = isUploadLimitFailure(exception);
    if (uploadLimit) {
      response.status(uploadLimit.tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST).json({
        error: uploadLimit.tooLarge
          ? { code: "too_large", message: "That upload is too large to process." }
          : { code: "invalid_request", message: "No file was included in that upload." },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = extractMessage(exception.getResponse());
      response.status(status).json({
        error: { code: codeForStatus(status), message },
      });
      return;
    }

    const detail = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `${request.method} ${request.originalUrl} — ${detail}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "internal_error",
        message: "Something went wrong. Please try again in a moment.",
      },
    });
  }
}

/** The fields that mark a body-parser failure. */
type BodyParseFailure = { type?: string; status?: number };

/**
 * Recognises multer's "this file is bigger than the limit" error.
 *
 * Duck-typed on `name`/`code` rather than `instanceof MulterError` so this module
 * keeps no import of multer — a transitive dependency of
 * `@nestjs/platform-express` that nothing else here references, and a hard import
 * would make it a real one.
 *
 * `LIMIT_UNEXPECTED_FILE` is included because a request with no `file` part would
 * otherwise be reported as a server fault when the honest answer is that the
 * upload was malformed. It is a 400, not a 413.
 */
function isUploadLimitFailure(error: unknown): { tooLarge: boolean } | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name !== "MulterError" || typeof candidate.code !== "string") return null;
  if (candidate.code === "LIMIT_FILE_SIZE") return { tooLarge: true };
  if (candidate.code === "LIMIT_UNEXPECTED_FILE" || candidate.code === "LIMIT_FILE_COUNT") {
    return { tooLarge: false };
  }
  return null;
}

/**
 * Finds a body-parser failure on `error` or on the `cause` Nest wraps it in.
 *
 * body-parser tags its errors with `type`: `entity.parse.failed` for malformed
 * JSON, `entity.too.large` for an over-limit body. Nest re-wraps them as
 * `BadRequestException` / `PayloadTooLargeException` and keeps the original in
 * `cause`, so one level of unwrapping covers both shapes.
 */
function findBodyParseFailure(error: unknown, depth = 0): BodyParseFailure | null {
  /* Bounded: a self-referential `cause` chain would otherwise spin. */
  if (depth > 3 || typeof error !== "object" || error === null) return null;

  const candidate = error as BodyParseFailure;
  const type = typeof candidate.type === "string" ? candidate.type : undefined;
  if (type === "entity.parse.failed" || type === "entity.too.large" || candidate.status === 413) {
    return { type, status: candidate.status };
  }

  return findBodyParseFailure((error as { cause?: unknown }).cause, depth + 1);
}

function extractMessage(response: string | object): string {
  if (typeof response === "string") return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(", ");
  return "Request failed.";
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return "bad_request";
    case 401: return "unauthorized";
    case 403: return "forbidden";
    case 404: return "not_found";
    case 405: return "method_not_allowed";
    case 409: return "conflict";
    case 413: return "payload_too_large";
    case 422: return "validation_failed";
    case 429: return "rate_limited";
    default: return "error";
  }
}
