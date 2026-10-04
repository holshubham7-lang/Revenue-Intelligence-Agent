import { config as loadDotEnv } from "dotenv";

/**
 * Loads `.env` into `process.env` as a side effect. This must stay the first
 * import in `main.ts`.
 *
 * ES imports are hoisted: every module `main.ts` imports is evaluated before its
 * body runs, so a `loadDotEnv()` call inside `bootstrap()` executes too late for
 * the modules that read the environment at import time. `agent/foundry.ts`,
 * `agent/analyze.ts` and `agent/agent-responses.ts` each capture `AZURE_OPENAI_*`
 * into a module-level const; evaluated first, they held an empty endpoint and
 * every model call failed with "AZURE_OPENAI_ENDPOINT is not set" — which reached
 * the user as a 503 on question generation while `loadConfig()` still passed,
 * because that one runs after the load.
 *
 * A separate module rather than a call in `main.ts` because there is no position
 * inside `main.ts` that runs before its own imports.
 *
 * `dotenv` does not overwrite variables that are already set, so a real
 * deployment environment still wins.
 */
loadDotEnv();
