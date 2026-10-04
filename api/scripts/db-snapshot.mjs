// Read-only database snapshot: collections, document counts, indexes, field names.
// Usage: node db-snapshot.mjs <path-to-env-file> [--database name]
//        node db-snapshot.mjs --from-env   (reads MONGODB_URI from the process env,
//        so a caller can pass a connection string without ever writing it to disk)
// The connection string is read from the env file and never printed. Only
// non-secret shape information (names, counts, index keys) goes to stdout.
import fs from "node:fs";
import { MongoClient } from "mongodb";

const fromEnv = process.argv.includes("--from-env");
const envPath = fromEnv ? null : process.argv[2];
if (!fromEnv && !envPath) {
  console.error("usage: node db-snapshot.mjs <env-file> [--database name] | --from-env");
  process.exit(2);
}

function readVar(file, key) {
  if (!file) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const uri = readVar(envPath, "MONGODB_URI") || process.env.MONGODB_URI || "";
if (!uri) {
  console.error(`${envPath ?? "environment"}: MONGODB_URI not set`);
  process.exit(2);
}
const dbName =
  process.argv.find((a, i) => a === "--database" ? true : false)
    ? process.argv[process.argv.indexOf("--database") + 1]
    : readVar(envPath, "MONGODB_DB") || new URL(uri).pathname.slice(1) || "revops";

// Printed so the two snapshots can be told apart; the host is not a secret value,
// but the credentials inside the URI are stripped.
const u = new URL(uri);
console.log(`target: ${u.protocol.replace(":", "")}//${u.host}  database: ${dbName}`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const collections = await db.listCollections().toArray();
console.log(`collections: ${collections.length}`);

for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
  const coll = db.collection(name);
  const count = await coll.estimatedDocumentCount();
  const indexes = (await coll.indexes()).map((i) =>
    `${i.name}[${Object.keys(i.key).join(",")}]${i.unique ? " unique" : ""}`,
  );
  const sample = await coll.findOne({});
  const fields = sample ? Object.keys(sample).sort().join(",") : "";
  console.log(`\n${name}  documents=${count}`);
  console.log(`  indexes: ${indexes.join(" | ")}`);
  console.log(`  fields: ${fields}`);
}

await client.close();
