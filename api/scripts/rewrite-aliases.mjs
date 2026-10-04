/**
 * Rewrites the `@/…` path alias to real relative imports.
 *
 * The frontend's Next.js bundler resolves `@/*` for free. This service does not:
 * TypeScript rewrites `.ts` → `.js` in relative specifiers at emit, but it
 * deliberately leaves non-relative ones alone (TS2877), because it cannot know
 * where a bare specifier will resolve at runtime. So an emitted
 * `import "@/db.js"` would reach Node unresolvable and the process would die at
 * startup with `ERR_MODULE_NOT_FOUND`.
 *
 * Rather than add a runtime resolver (a loader hook, `tsc-alias`, or a bundler)
 * for one alias, every import becomes relative and nothing has to resolve
 * anything at runtime.
 *
 * Run from the `api` directory: `node scripts/rewrite-aliases.mjs`
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "..", "src");

/** `@/auth/user.ts` -> the module path relative to `fromFile`, extension included. */
function toRelative(fromFile, specifier) {
  const target = join(srcRoot, specifier.slice(2));
  let rel = relative(dirname(fromFile), target);
  rel = rel.split("\\").join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".ts")) yield full;
  }
}

let changedFiles = 0;
let changedImports = 0;

for await (const file of walk(srcRoot)) {
  const before = await readFile(file, "utf8");
  const after = before.replace(/(from\s+|import\s*\(\s*)["']@\/([^"']+)["']/g, (match, prefix, spec) => {
    changedImports += 1;
    return `${prefix}"${toRelative(file, `@/${spec}`)}"`;
  });
  if (after !== before) {
    await writeFile(file, after, "utf8");
    changedFiles += 1;
  }
}

console.log(`rewrote ${changedImports} import(s) across ${changedFiles} file(s)`);
