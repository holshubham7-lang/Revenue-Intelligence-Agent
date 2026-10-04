/**
 * Environment contract for the API.
 *
 * Validated once at boot and cached. Failing fast here matters more than the
 * usual "return 500 later" argument:
 *
 * - `APP_BASE_URL` is *required*, not optional. The browser only ever talks to
 *   the Next.js origin; the API sits behind the `/api/*` rewrite. So a request
 *   arriving here carries the API's own `Host` (`localhost:3010`), and any
 *   origin derived from it would produce a `redirect_uri` of
 *   `http://localhost:3010/api/auth/oauth/.../callback` — which no provider has
 *   registered, and which the provider console cannot be taught without
 *   re-registering every callback. Refusing to boot beats an opaque
 *   `redirect_uri_mismatch` on the user's first social sign-in.
 * - `AUTH_SECRET` length is enforced here as well as at use, because an empty
 *   or short secret would otherwise surface as a confusing 500 mid-sign-in.
 */

export type ApiConfig = {
  nodeEnv: string;
  port: number;
  isProduction: boolean;
  appBaseUrl: string;
  authSecret: string;
  mongodbUri: string;
  mongodbDb: string;
  /** Comma-separated list of allowed browser origins. Empty means same-origin only. */
  allowedOrigins: string[];
  microsoftTenant: string;
};

const MIN_AUTH_SECRET_LENGTH = 32;

let cached: ApiConfig | null = null;

/**
 * Reads and validates configuration. Throws with an actionable message rather
 * than returning a half-valid object, because every one of these is fatal.
 *
 * @param overrides values injected by tests, applied after the environment read.
 */
export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  if (cached && Object.keys(overrides).length === 0) return cached;

  const nodeEnv = overrides.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";

  const appBaseUrl = requireValue(
    overrides.appBaseUrl ?? process.env.APP_BASE_URL,
    "APP_BASE_URL",
    "The public origin the browser uses, e.g. http://localhost:3000. Required: the API is behind the Next.js /api rewrite, so it cannot infer the browser's origin from its own Host header.",
  );
  assertHttpOrigin(appBaseUrl, "APP_BASE_URL");

  const authSecret = requireValue(
    overrides.authSecret ?? process.env.AUTH_SECRET,
    "AUTH_SECRET",
    "At least 32 characters. Signs session cookies and OAuth transaction state.",
  );
  if (authSecret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters; got ${authSecret.length}. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }

  const mongodbUri = requireValue(
    overrides.mongodbUri ?? process.env.MONGODB_URI,
    "MONGODB_URI",
    "The MongoDB connection string.",
  );

  const mongodbDb = (overrides.mongodbDb ?? process.env.MONGODB_DB ?? "").trim() || "revops";

  const port = Number(process.env.PORT ?? 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; got "${process.env.PORT}".`);
  }

  const allowedOrigins = (overrides.allowedOrigins ?? parseOrigins(process.env.ALLOWED_ORIGINS))
    .map((origin) => origin.replace(/\/+$/, ""))
    .filter(Boolean);

  const config: ApiConfig = {
    nodeEnv,
    port,
    isProduction,
    appBaseUrl: appBaseUrl.replace(/\/+$/, ""),
    authSecret,
    mongodbUri,
    mongodbDb,
    allowedOrigins,
    microsoftTenant: process.env.MICROSOFT_TENANT || "common",
  };

  if (Object.keys(overrides).length === 0) cached = config;
  return config;
}

/** Test seam — drops the cached config so a test can re-read a changed environment. */
export function resetConfigCache(): void {
  cached = null;
}

function requireValue(value: string | undefined, name: string, hint: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is not set. ${hint}`);
  }
  return trimmed;
}

function assertHttpOrigin(value: string, name: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL; got "${value}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be http or https; got "${url.protocol}".`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(`${name} must be a bare origin with no path; got "${value}".`);
  }
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
