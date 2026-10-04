import { MongoClient, type Db } from "mongodb";

/**
 * MongoDB connection helper — points at the shared **revops** database.
 *
 * Next.js hot-reloads route modules frequently, so the client is cached on
 * `globalThis` in dev to avoid exhausting connection pools. Production keeps a
 * module-scoped singleton, which is enough for a single runtime.
 *
 * Configure via env (see `.env.local`):
 *   MONGODB_URI = mongodb://127.0.0.1:27017
 *   MONGODB_DB  = revops
 */

declare global {
  var __revopsMongo: { client: MongoClient; promise: Promise<MongoClient> } | undefined;
}

/**
 * Read per call rather than caching at module load.
 *
 * `MONGODB_DB` is normally fixed for the process lifetime, but tests need to
 * point at a scratch database. Snapshotting it at import time meant a test could
 * not redirect the connection, and would quietly run against the development
 * database instead — the worst possible failure mode for a test that writes.
 */
function dbName(): string {
  return process.env.MONGODB_DB ?? "revops";
}

function createClient(): MongoClient {
  const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017", {
    // The URL carries no credentials locally; keep sane timeouts so API routes
    // fail fast when the server is down instead of hanging.
    serverSelectionTimeoutMS: 5_000,
  });
  return client;
}

/** Returns the connected MongoClient, creating and caching it once. */
export async function getMongoClient(): Promise<MongoClient> {
  const cache = globalThis.__revopsMongo;
  if (cache?.promise) return cache.promise;

  const client = createClient();
  const promise = client.connect().then(() => client);
  globalThis.__revopsMongo = { client, promise };
  return promise;
}

/** Returns the `revops` database handle from the cached client. */
export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName());
}

/** List the collections currently present in the `revops` database. */
export async function listCollections(): Promise<string[]> {
  const db = await getDb();
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  return cols.map((c) => c.name);
}