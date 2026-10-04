import "./env";
import "reflect-metadata";

import { Logger, ValidationPipe, HttpStatus } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter, type NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { ApiError, ApiExceptionFilter, invalidJson } from "./common/api-error";
import { loadConfig } from "./common/config";

/**
 * Boots the API.
 *
 * `.env` is loaded by `./env`, imported above everything else — see that module
 * for why the load cannot live in this file.
 *
 * The global prefix is `/api` so that the Next.js rewrite is a transparent
 * pass-through: the browser keeps requesting `/api/...` on its own origin and
 * every route path here is identical to the route it replaces. Nothing in the
 * frontend had to change to move from route handlers to this service, which is
 * what makes the switch reversible one route at a time.
 */
/**
 * A JSON body parser that reports failures in the shared envelope.
 *
 * body-parser signals malformed JSON by calling `next(error)`, and Nest wraps
 * that into a `BadRequestException` whose `cause` is discarded — so by the time
 * an exception filter sees it, the only trace is the parser's own message
 * ("Expected property name or '}' in JSON at position 1"). The Next.js route
 * handlers answered `code: "invalid_json"`, `message: "Invalid request body."`
 * instead, so mapping on the message text would be both fragile and ugly.
 *
 * Wrapping the parser keeps the translation next to the thing that knows what
 * went wrong. An over-limit body is reported as `payload_too_large` for the same
 * reason: it is a 413 the routes have to distinguish from other failures.
 */
function jsonBodyParser(limit: string) {
  const parse = express.json({ limit, type: ["application/json", "application/*+json"] });
  return (request: express.Request, response: express.Response, next: express.NextFunction): void => {
    parse(request, response, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }
      const tooLarge = (error as { type?: string }).type === "entity.too.large";
      next(
        tooLarge
          ? new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, "payload_too_large", "That request body is too large to process.")
          : invalidJson(),
      );
    });
  };
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  // Validates and caches the environment. Throws here, before listening, so a
  // missing APP_BASE_URL or AUTH_SECRET is a failed start rather than a runtime 500.
  const config = loadConfig();

  /* The HTTP stack is assembled by hand rather than by Nest's defaults, so the
     middleware order and each parser's error behaviour are explicit and cannot
     shift under a framework upgrade. */
  const server = express();
  server.disable("x-powered-by");
  /* Behind the Next.js rewrite there is no public edge that can be trusted to
     set X-Forwarded-*. Express would otherwise infer the client's protocol and
     address from those headers — exactly the input `baseUrl()` validates — so
     `request.protocol` is kept honest and APP_BASE_URL stays the only origin
     source of truth. */
  server.set("trust proxy", false);

  server.use(helmet());
  server.use(cookieParser());
  server.use(jsonBodyParser("1mb"));
  /* Some providers POST the OAuth callback as form-encoded
     (`response_mode=form_post`), which `auth.controller.ts` accepts. */
  server.use(express.urlencoded({ extended: false, limit: "1mb" }));

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    /* Handled above; Nest must not install its own parsers, or they would
       reject a malformed body first and this wrapper would never run. */
    { bodyParser: false },
  );

  /* Every route is declared relative to this, so the paths served here are
     byte-identical to the Next.js route handlers they replace. That is what lets
     the frontend keep requesting `/api/...` and the rewrite stay a
     pass-through. */
  app.setGlobalPrefix("api");

  /* Same-origin is the design: the browser only ever talks to Next.js on :3000,
     and Next forwards `/api/*` here. So this list exists for direct tools
     (curl, the OAuth provider's callback probe, server-to-server calls) — never
     for the app itself. `credentials: true` is deliberately absent: with no
     cross-origin browser path, allowing credentialed CORS would only widen the
     blast radius. */
  if (config.allowedOrigins.length > 0) {
    app.enableCors({
      origin: config.allowedOrigins,
      methods: ["GET", "POST", "DELETE"],
      credentials: false,
      maxAge: 600,
    });
    logger.log(`CORS enabled for: ${config.allowedOrigins.join(", ")}`);
  } else {
    logger.log("CORS disabled — same-origin only (expected for the /api rewrite)");
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      /* Every controller validates its own payload with a shared validator and
         reports field errors in the `{ error: { fields } }` envelope, so the
         built-in pipe stays in whitelist mode only: it drops undeclared keys
         from DTO-validated bodies and leaves everything else to the validator. */
      validationError: { target: false, value: false },
    }),
  );

  // Single place that turns anything thrown into `{ error: { code, message } }`.
  app.useGlobalFilters(new ApiExceptionFilter());

  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`API listening on http://localhost:${config.port} (prefix /api)`);
  logger.log(`Browser origin: ${config.appBaseUrl}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Bootstrap");
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to start: ${message}`);
  process.exit(1);
});
