/**
 * Test-only: pins the database before any module that reads it is loaded.
 *
 * `lib/db.ts` resolves `MONGODB_DB` once, at import time. A test that set the
 * variable in its own body would be too late, and would then write its fixtures
 * into the development database. Imported first, the assignment happens during
 * the module's own evaluation, before `./identity.ts` pulls in `db.ts`.
 */
process.env.MONGODB_DB = "revops_oauth_test";

export const TEST_DATABASE = "revops_oauth_test";
