#!/usr/bin/env node
/**
 * Fails if the compiled API asks Node for a .ts file.
 *
 * `node scripts/check-dist.mjs` — path-independent, and takes a
 * comma-separated list of build directories relative to the repo root.
 *
 * `rewriteRelativeImportExtensions` rewrites `./x.ts` in import declarations,
 * but not inside `await import("…")` — the specifier there is a runtime string.
 * Those survive into dist untouched and only throw when the built server loads
 * the module, which dev (tsx, source on disk) and unit tests (tsx, same) both
 * sail past. The deployed app is the only thing that runs dist, so without this
 * check a broken request path deploys green.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, so the script works whether npm ran it from api/ or from the root. */
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const TARGETS = (process.argv[2] ?? "api/dist").split(",").map((t) => resolve(ROOT, t));
const SPECIFIER = /(?:from\s*|require\(|import\s*\()\s*["'](\.[^"']*\.ts)["']/g;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".js") ? [full] : [];
  });

const offenders = [];
for (const root of TARGETS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8").split("\n");
    source.forEach((line, i) => {
      for (const match of line.matchAll(SPECIFIER)) {
        offenders.push(`${relative(ROOT, file)}:${i + 1}  ${match[1]}`);
      }
    });
  }
}

if (offenders.length > 0) {
  console.error(`${offenders.length} specifier(s) in the build still point at .ts:`);
  for (const o of offenders) console.error("  " + o);
  console.error("Import the module statically, or rewrite the path to the compiled .js.");
  process.exit(1);
}
console.log(`dist clean: no .ts specifiers under ${TARGETS.join(", ")}`);
