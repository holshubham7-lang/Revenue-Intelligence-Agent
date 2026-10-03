/**
 * Guards the one invariant the two implementations depend on.
 *
 * `frontend/lib` and `api/src` hold the same data + agent modules on purpose:
 * the Next app can serve every route itself, and NestJS can take over behind
 * `API_REWRITE_ENABLED`. That only stays true if a fix lands on both sides, and
 * the sole difference allowed between a pair is how each one spells its imports
 * — Next resolves the `@/…` alias, this service rewrites it to relative paths at
 * build time (see rewrite-aliases.mjs).
 *
 * So: rewrite the frontend specifier, then require the files to match exactly.
 *
 * `lib/agent` is deliberately not in the list: the two sides genuinely differ
 * there, because the service calls the Foundry *agent* endpoint and the frontend
 * falls back to the plain model deployment.
 *
 * Run from the `v1.1` directory: `node scripts/check-mirrors.mjs`
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Pairs that are meant to stay identical, relative to `frontend/lib` / `api/src`. */
const MIRROR_DIRS = ["data"];
const MIRROR_FILES = ["content.ts", "db.ts"];

/** `@/lib/…` as the frontend writes it -> the specifier the API emits. */
const ALIAS_RULES = [
  [/@\/lib\/data\//g, "./"],
  [/@\/lib\/(security|agent|storage|auth)\//g, "../$1/"],
  [/@\/lib\/db\b/g, "../db"],
  [/@\/(content|companies|contracts)\b/g, "../$1"],
  [/@\/lib\//g, "./"],
];

const rewrite = (text) => ALIAS_RULES.reduce((t, [re, to]) => t.replace(re, to), text);

async function* modules(dir) {
  for (const entry of await readdir(join(root, "frontend", "lib", dir), {
    withFileTypes: true,
  })) {
    // Test files run in both suites but are not rewritten mirrors of each
    // other, so they are checked by the suites rather than here.
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      yield `${dir}/${entry.name}`;
    }
  }
}

const read = (side, rel) => readFile(join(root, side, rel), "utf8");

const pairs = [...MIRROR_FILES];
for (const dir of MIRROR_DIRS) for await (const rel of modules(dir)) pairs.push(rel);

const drifted = [];
for (const rel of pairs) {
  const [front, api] = await Promise.all([
    read("frontend", join("lib", rel)),
    read("api", join("src", rel)),
  ]);
  if (rewrite(front) !== api) drifted.push(rel);
}

console.log(`${pairs.length - drifted.length}/${pairs.length} mirrored modules agree.`);
if (!drifted.length) process.exit(0);

console.error(
  `\nThese differ by more than the import alias, which means a change landed on one\n` +
    `side only (or a genuine API-only file was added under a mirrored path):\n\n` +
    drifted.map((rel) => `  lib/${rel}  vs  src/${rel}`).join("\n") +
    `\n`,
);
process.exit(1);
