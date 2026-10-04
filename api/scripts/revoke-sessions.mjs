/**
 * Revokes every session for one account by rotating its `tokenVersion`.
 *
 * A session cookie embeds the `tokenVersion` it was minted with, and
 * `resolveSessionUser` rejects any claim whose `ver` no longer matches the user
 * document. So one increment invalidates every token ever issued to that
 * account, on every device, without needing a session store or a list of cookies
 * to clear. This is the same mechanism `POST /api/auth/signout` uses, which is
 * why it works for sessions the user cannot see or delete themselves.
 *
 * Scoped by email on purpose: this is a shared database whose other rows are
 * local test fixtures, and a blanket `updateMany` would rotate those too.
 *
 * Usage: node scripts/revoke-sessions.mjs <email>
 */
import { config as loadDotEnv } from "dotenv";
import { MongoClient } from "mongodb";

loadDotEnv();

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/revoke-sessions.mjs <email>");
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Add it to .env or pass it in the environment.");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const users = client.db(process.env.MONGODB_DB || "revops").collection("users");

  const before = await users.findOne({ email }, { projection: { tokenVersion: 1 } });
  if (!before) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const result = await users.updateOne(
    { email },
    { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date().toISOString() } },
  );
  const after = await users.findOne({ email }, { projection: { tokenVersion: 1 } });

  console.log(`user         : ${email}`);
  console.log(`matched      : ${result.matchedCount}  modified: ${result.modifiedCount}`);
  console.log(`tokenVersion : ${before.tokenVersion} -> ${after.tokenVersion}`);
  console.log(
    "\nEvery existing session cookie for this account is now invalid. The next\n" +
      "request with one is answered unauthenticated; the user must sign in again.",
  );
} catch (error) {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
