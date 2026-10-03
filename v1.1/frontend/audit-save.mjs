/**
 * Focused audit of the data *saving* process, driven against the live dev server
 * and the real Mongo. Retrieval is out of scope; this only checks that what gets
 * persisted is consistent, idempotent, and re-uploadable.
 */

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const jar = new Map();
let csrf = "";

const problems = [];
const ok = [];

function check(passed, label, detail = "") {
  (passed ? ok : problems).push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const cookies = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookies) headers.cookie = cookies;
  if (csrf && !headers["x-csrf-token"]) headers["x-csrf-token"] = csrf;
  if (options.json !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    redirect: "manual",
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

const stamp = Date.now();
const email = `save.${stamp}@example.test`;
const password = "SaveTest!2025x";

/* setup ------------------------------------------------------------------ */
const c0 = await api("/api/auth/csrf");
csrf = c0.json.csrfToken;
await api("/api/auth/signup", { method: "POST", json: { name: "Save Audit", email, password } });
await api("/api/auth/signin", { method: "POST", json: { email, password } });
const co = await api("/api/companies", {
  method: "POST",
  json: {
    companyName: `Save Audit ${stamp}`,
    website: "https://example.test",
    industry: "Services",
    companySize: "11–50 people",
    country: "India",
    revenueRange: "$1M – $10M",
    problem: "Stalls.",
  },
});
check(co.status === 201, "company saved", `status ${co.status}`);

const csv = [
  "Deal name,Amount,Stage,Close Date",
  "Alpha Deal,100000,Negotiation,2025-01-10",
  "Beta Deal,50000,Won,2024-12-01",
  "Gamma Deal,25000,Proposal,",
].join("\n");

async function uploadCsv(name = "deals.csv") {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), name);
  return api("/api/company/data-sources", { method: "POST", body: form });
}

async function confirm(res) {
  return api("/api/company/data-sources", {
    method: "POST",
    json: {
      fileId: res.json.fileId,
      sheetName: res.json.sheetName,
      columns: res.json.mapping.columns.map((c) => ({ header: c.header, field: c.field })),
    },
  });
}

/* 1. upload + confirm ---------------------------------------------------- */
const up1 = await uploadCsv();
check(up1.status === 201, "first upload stored", `status ${up1.status}`);
const cf1 = await confirm(up1);
check(cf1.status === 200, "first confirm analysed", `status ${cf1.status}`);
const fileId = up1.json.fileId;

/* 2. identical re-upload is deduped, not duplicated --------------------- */
const up2 = await uploadCsv();
check(up2.status === 200, "identical re-upload deduped (not 201)", `status ${up2.status}`);
check(up2.json.fileId === fileId, "re-upload returns the same fileId");
check(up2.json.reused === true, "re-upload flagged as reused");
check(Boolean(up2.json.mapping?.columns?.length), "re-upload still returns a usable mapping",
  up2.json.mapping ? `${up2.json.mapping.columns.length} columns` : "mapping missing");

/* 3. ingest jobs: how many per confirmation? ---------------------------- */
const jobs = await api("/api/company/data-sources/list");
check(jobs.status === 200, "data source list readable", `${jobs.json.files?.length ?? 0} file(s)`);

/* 4. delete, then re-upload the identical file -------------------------- */
const del = await api("/api/company/data-sources/list", { method: "DELETE", json: { fileId } });
check(del.status === 200, "file deleted", `status ${del.status}`);

const afterDelete = await api("/api/company/action-plan");
check(afterDelete.status === 200, "action-plan endpoint still healthy after delete");

const up3 = await uploadCsv();
check(
  up3.status === 201 || up3.status === 200,
  "re-uploading a deleted file is allowed",
  `status ${up3.status}${up3.status >= 400 ? ` ${up3.text.slice(0, 160)}` : ""}`,
);

if (up3.status >= 400) {
  check(false, "deleted file can be re-uploaded without a duplicate-key error",
    `got ${up3.status}: ${up3.json?.error?.code ?? up3.text.slice(0, 120)}`);
} else if (up3.status === 200) {
  check(false, "re-upload after delete created a fresh record",
    "server returned the deleted file instead of a new one");
}

console.log(`\n${ok.length} passed, ${problems.length} failed`);
if (problems.length) {
  console.log("\nProblems:");
  for (const p of problems) console.log(`  - ${p}`);
}
console.log(`\nAccount: ${email} / ${password}`);
