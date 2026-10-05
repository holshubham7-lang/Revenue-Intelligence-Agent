/**
 * Regenerates an `api/src` mirror from its `frontend/lib` original.
 *
 * Uses the same rules as `scripts/check-mirrors.mjs`, so running this and then
 * the checker can never disagree about what a mirror is supposed to look like.
 *
 * Usage: node scripts/write-mirror.mjs onboarding.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NESTED_ALIAS_RULES = [
  [/@\/lib\/data\//g, "./"],
  [/@\/lib\/(security|agent|storage|auth)\//g, "../$1/"],
  [/@\/lib\/db\b/g, "../db"],
  [/@\/(content|companies|contracts)\b/g, "../$1"],
  [/@\/lib\//g, "./"],
];

const ROOT_ALIAS_RULES = [
  [/@\/lib\/data\//g, "./data/"],
  [/@\/lib\/(security|agent|storage|auth)\//g, "./$1/"],
  [/@\/lib\/db\b/g, "./db"],
  [/@\/(content|companies|contracts)\b/g, "./$1"],
  [/@\/lib\//g, "./"],
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = process.argv[2];
if (!rel) {
  console.error("usage: node scripts/write-mirror.mjs <module>.ts");
  process.exit(2);
}

const rules = rel.includes("/") ? NESTED_ALIAS_RULES : ROOT_ALIAS_RULES;
const front = readFileSync(join(root, "frontend", "lib", rel), "utf8");
const api = rules.reduce((t, [from, to]) => t.replace(from, to), front);

writeFileSync(join(root, "api", "src", rel), api);
console.log(`wrote api/src/${rel} from frontend/lib/${rel}`);