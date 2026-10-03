import { Controller, Get } from "@nestjs/common";

import { loadConfig } from "./common/config";

/**
 * Liveness and configuration echo.
 *
 * `/api/health` is unauthenticated by design — an orchestrator has no session.
 * It deliberately reports *not ready* about configuration rather than about
 * credentials, so it is safe to expose: it never returns a secret, only whether
 * one is present.
 */
@Controller("health")
export class HealthController {
  @Get()
  check() {
    const config = loadConfig();
    return {
      status: "ok",
      service: "revops-api",
      /** The browser-facing origin, useful for confirming the rewrite target. */
      origin: config.appBaseUrl,
      /** Whether each provider has credentials, without revealing them. */
      providers: {
        google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
        linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      },
    };
  }
}
