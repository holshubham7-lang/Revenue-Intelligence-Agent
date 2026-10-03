"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/api/csrf-client";
import { company } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Upload one or more reports, confirm each one's column mapping, then analyse.
 *
 * Files are uploaded one at a time and reviewed one at a time rather than as a
 * single multi-file form. Every file needs its own mapping confirmed before
 * anything is analysed, and one request carrying four files would either analyse
 * columns nobody confirmed or block until the user had reviewed four tables that
 * aren't on screen. So the queue is walked deliberately, and the user is always
 * looking at exactly one decision.
 *
 * Two steps per file because the mapping is the one decision this pipeline refuses
 * to make for the user. `Amount` and `ARR` are both plausible value columns and
 * mean different things; guessing between them produces an action plan built on a
 * total that is wrong by the ratio between them, with nothing in the output to
 * signal it. So the user sees the proposal and edits it.
 *
 * The upload posts with `fetch` rather than `postJson` because that helper sends
 * JSON, and this is `multipart/form-data`. The CSRF token is sent as a header so
 * the server's double-submit check still applies.
 */

type ColumnProposal = {
  header: string;
  field: string | null;
  confidence: number;
  ambiguous: boolean;
};

type UploadResult = {
  fileId: string;
  fileName: string;
  sheetNames: string[];
  sheetName: string;
  rowCount: number;
  mapping: {
    entityType: string;
    columns: ColumnProposal[];
    missing: string[];
    mappable: boolean;
  };
};

type ConfirmResult = {
  rows: number;
  skipped: number;
  metrics: {
    totalRecords: number;
    dateRange: { from: string; to: string } | null;
    amountSum: number;
    currency: string | null;
    stageCounts: Record<string, number>;
    nullCounts: Record<string, number>;
    duplicateCount: number;
    staleRecordCount: number;
  };
  summary: string;
  semanticGaps: string[];
  warnings: string[];
  degraded: boolean;
  questions: string[];
  /** Non-null when only question generation failed; the ingest itself succeeded. */
  questionsError?: string | null;
  dataset?: {
    fileCount: number;
    fileNames: string[];
    valid: boolean;
    blockers: string[];
    caveats: string[];
  };
};

type QueueItem = {
  key: string;
  fileName: string;
  state: "uploading" | "mapping" | "analysing" | "done" | "failed";
  upload: UploadResult | null;
  profile: ConfirmResult | null;
  error: string | null;
};

/** The canonical fields a user can assign. `entityType` is inferred, not chosen. */
const FIELD_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "amount", label: "Amount / value" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "stage", label: "Stage" },
  { value: "status", label: "Status" },
  { value: "sourceKey", label: "Record ID" },
];

/**
 * Only the row label is required, mirroring `REQUIRED` in `lib/data/canonical.ts`.
 * A value column is not: an event log or a company extract has none, and marking
 * it required here would tell the user a file they can plainly read is incomplete.
 */
const REQUIRED_FIELDS = new Set(["name"]);

/**
 * Reads a JSON response, throwing the server's own message on a non-2xx.
 *
 * `postJson` returns the raw `Response` and only special-cases a stale CSRF
 * token, so the status check belongs to the caller. Skipping it is what turned a
 * `422 unmappable_columns` into a crash: the error envelope
 * `{ error: { code, message } }` is truthy, so it was stored as the file's
 * profile and the summary screen then read `.metrics.totalRecords` off it.
 */
async function readJsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) throw new Error(body?.error?.message ?? fallback);
  if (!body) throw new Error(fallback);
  return body;
}

export function DataUpload({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [columns, setColumns] = useState<ColumnProposal[]>([]);
  const [sheetName, setSheetName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  /**
   * The file the user is looking at. `analysing` is included so the mapping
   * screen stays mounted while it works — the user can see what they confirmed
   * and correct it if the result comes back with a problem.
   */
  const active = queue.find((item) => item.state === "mapping" || item.state === "analysing") ?? null;
  const done = queue.filter((item) => item.state === "done" && item.profile);
  const failed = queue.filter((item) => item.state === "failed");
  const uploadingCount = queue.filter((item) => item.state === "uploading").length;
  const remaining = queue.filter((item) => item.state === "mapping").length;

  const send = useCallback(
    async (input: string, init: RequestInit, token: string | null): Promise<Response> => {
      const post = (t: string | null) =>
        fetch(input, {
          ...init,
          credentials: "include",
          cache: "no-store",
          // A custom header is safe alongside FormData — only `Content-Type`
          // is reserved, because `fetch` must set it to add the multipart
          // boundary itself.
          ...(t ? { headers: { "X-CSRF-Token": t } } : {}),
        });

      const res = await post(token);
      if (res.ok) return res;

      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;

      // Same recovery the JSON helper does: a stale token is re-fetched and the
      // request replayed once, so an hour-old tab doesn't fail on a valid session.
      if (res.status === 403 && body?.error?.code === "csrf_failed") {
        const fresh = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" })
          .then((r) => r.json().catch(() => null))
          .then((j: { csrfToken?: string } | null) => j?.csrfToken ?? null)
          .catch(() => null);
        if (fresh) return post(fresh);
      }

      throw new Error(body?.error?.message ?? "Something went wrong. Please try again.");
    },
    [],
  );

  function update(key: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  /**
   * Uploads each selected file in turn.
   *
   * Sequential on purpose: each upload carries its own mapping proposal that the
   * user has to review, and firing four at once would mean four proposals in
   * flight with one screen to review them on. A failure is recorded against its
   * own file and the rest of the queue keeps moving — one unreadable export
   * shouldn't cost the user the other three.
   */
  async function handleFiles(files: FileList) {
    const list = Array.from(files);
    if (busy || list.length === 0) return;

    setError(null);
    setBusy(true);

    const queued: QueueItem[] = list.map((file) => ({
      key: `${file.name}:${file.size}:${file.lastModified}`,
      fileName: file.name,
      state: "uploading",
      upload: null,
      profile: null,
      error: null,
    }));

    setQueue((prev) => [...prev, ...queued]);

    const settled = new Map<string, QueueItem>();

    for (const [index, item] of queued.entries()) {
      try {
        const form = new FormData();
        form.append("file", list[index]);

        const res = await send("/api/company/data-sources", { method: "POST", body: form }, csrfToken);
        const result = (await res.json()) as UploadResult;

        settled.set(item.key, { ...item, state: "mapping", upload: result });
      } catch (err) {
        settled.set(item.key, {
          ...item,
          state: "failed",
          error: err instanceof Error ? err.message : "That upload didn't work. Please try again.",
        });
      }
    }

    // One state write, so the queue never renders a half-updated list and the
    // first mapping is available on the very next render.
    setQueue((prev) => prev.map((item) => settled.get(item.key) ?? item));

    const firstMapping = [...settled.values()].find((item) => item.state === "mapping");
    if (firstMapping?.upload) {
      setColumns(firstMapping.upload.mapping.columns);
      setSheetName(firstMapping.upload.sheetName);
    } else {
      setError([...settled.values()].find((item) => item.error)?.error ?? null);
    }

    setBusy(false);
  }

  /** Loads the next file's proposals after the current one is confirmed. */
  function loadNextMapping(excludeKey: string) {
    const next = queue.find((item) => item.state === "mapping" && item.key !== excludeKey);
    if (next?.upload) {
      setColumns(next.upload.mapping.columns);
      setSheetName(next.upload.sheetName);
    } else {
      setColumns([]);
      setSheetName("");
    }
  }

  async function handleConfirm() {
    if (!active?.upload) return;

    setBusy(true);
    setError(null);
    update(active.key, { state: "analysing" });

    try {
      const res = await postJson("/api/company/data-sources", {
        fileId: active.upload.fileId,
        sheetName,
        columns: columns.map((c) => ({ header: c.header, field: c.field })),
      });
      const result = await readJsonOrThrow<ConfirmResult>(
        res,
        "Couldn't analyse that file.",
      );

      update(active.key, { state: "done", profile: result });
      loadNextMapping(active.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyse that file.");
      update(active.key, { state: "mapping" });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Re-reads a different sheet of an already-uploaded file.
   *
   * The column proposals belong to one specific sheet, so switching sheets has to
   * fetch that sheet's headers — otherwise the user would be confirming one
   * sheet's mapping against another sheet's columns, and the server would reject
   * a confirmation the UI made look valid.
   */
  async function handleSheetChange(next: string) {
    if (!active?.upload || busy || next === sheetName) return;

    setSheetName(next);
    setBusy(true);
    setError(null);

    try {
      const res = await postJson("/api/company/data-sources", {
        fileId: active.upload.fileId,
        sheetName: next,
        inspect: true,
      });
      const result = await readJsonOrThrow<UploadResult>(res, "Couldn't read that sheet.");

      update(active.key, { upload: { ...active.upload, ...result } });
      setColumns(result.mapping.columns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that sheet.");
      setSheetName(sheetName);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Records the skip server-side, then moves on.
   *
   * The stage transition is the point: a client-side `router.push` would leave
   * the company in `company_saved` with no record that data was offered and
   * declined, so the onboarding state would misreport what happened.
   */
  async function skip() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await postJson("/api/company/data-sources/skip", {});
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't skip that step. Please try again.");
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  // Mid-upload: which files are in, which are done, which failed. Kept as its own
  // screen so a four-file drop isn't a blank wait.
  if (busy && uploadingCount > 0) {
    return (
      <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">{company.data.upload.title}</h2>
        <ul className="mt-5 space-y-2">
          {queue.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm text-ink-muted">
              {item.state === "done" ? (
                <Check className="size-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden="true" />
              ) : item.state === "failed" ? (
                <TriangleAlert className="size-4 shrink-0 text-negative" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand" aria-hidden="true" />
              )}
              <span className="truncate">{item.fileName}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (active?.upload) {
    const analysing = active.state === "analysing";

    return (
      <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">{company.data.mapping.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {company.data.mapping.body
            .replace("{file}", active.upload.fileName)
            .replace("{rows}", active.upload.rowCount.toLocaleString())}
        </p>

        {done.length > 0 ? (
          <p className="mt-3 text-xs font-semibold text-brand">
            {done.length} of {queue.length} analysed
            {remaining > 0
              ? ` · ${company.data.upload.remainingLabel.replace("{count}", String(remaining))}`
              : ""}
          </p>
        ) : null}

        {active.upload.sheetNames.length > 1 ? (
          <label className="mt-5 block text-sm font-semibold text-ink">
            {company.data.mapping.sheetLabel}
            <select
              value={sheetName}
              onChange={(e) => void handleSheetChange(e.target.value)}
              disabled={busy}
              className="mt-1 block w-full rounded-control border border-line bg-bg px-3 py-2 text-sm font-normal text-ink"
            >
              {active.upload.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-ink-subtle uppercase">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {company.data.mapping.columnLabel}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  {company.data.mapping.fieldLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column, index) => (
                <tr key={`${column.header}-${index}`} className="border-b border-line/60">
                  <th scope="row" className="py-2.5 pr-4 text-left font-medium text-ink">
                    {column.header}
                    {column.ambiguous ? (
                      <span className="ml-2 rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">
                        {company.data.mapping.ambiguous}
                      </span>
                    ) : null}
                  </th>
                  <td className="py-2.5">
                    <select
                      value={column.field ?? ""}
                      onChange={(e) => {
                        const value = e.target.value || null;
                        setColumns((prev) => {
                          // One column per field: choosing a field here clears it
                          // from any other column, so the server can't receive a
                          // duplicate it would have to reject.
                          const next = prev.map((c) =>
                            value && c.field === value && c.header !== column.header
                              ? { ...c, field: null }
                              : c,
                          );
                          return next.map((c, i) => (i === index ? { ...c, field: value } : c));
                        });
                      }}
                      disabled={busy}
                      className="w-full rounded-control border border-line bg-bg px-3 py-1.5 text-sm text-ink"
                    >
                      <option value="">{company.data.mapping.ignore}</option>
                      {FIELD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                          {REQUIRED_FIELDS.has(option.value) ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-ink-subtle">{company.data.mapping.requiredHint}</p>

        {error ? <ErrorNote message={error} onDismiss={() => setError(null)} /> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={handleConfirm} disabled={busy}>
            {analysing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {company.data.mapping.analysing}
              </>
            ) : (
              company.data.mapping.confirm
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              // Dropping the file rather than silently ignoring it — a queue
              // entry the user can't get back to would strand them here.
              update(active.key, { state: "failed", error: company.data.mapping.discarded });
              loadNextMapping(active.key);
            }}
            disabled={busy}
          >
            {company.data.mapping.skipFile}
          </Button>
        </div>
      </section>
    );
  }

  if (done.length > 0) {
    const totals = done.reduce(
      (acc, item) => ({
        records: acc.records + item.profile!.metrics.totalRecords,
        amount: acc.amount + item.profile!.metrics.amountSum,
      }),
      { records: 0, amount: 0 },
    );
    const warnings = done.flatMap((item) => item.profile!.warnings);

    return (
      <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
        <div className="flex items-center gap-2 text-brand">
          <Check className="size-5" strokeWidth={2.5} aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-ink">{company.data.upload.completeTitle}</h2>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={company.data.stats.files} value={String(done.length)} />
          <Stat label={company.data.stats.records} value={totals.records.toLocaleString()} />
          <Stat
            label={company.data.stats.amount}
            value={totals.amount === 0 ? "—" : totals.amount.toLocaleString()}
          />
        </dl>

        <div className="mt-5 space-y-4">
          {done.map((item) => (
            <div key={item.key} className="border-l-2 border-line pl-4">
              <p className="text-sm font-semibold text-ink">{item.fileName}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.profile!.summary}</p>
            </div>
          ))}
        </div>

        {failed.length > 0 ? (
          <div className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <TriangleAlert className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              {company.data.notAnalysedTitle}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {failed.map((item) => (
                <li key={item.key}>• {item.fileName}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <TriangleAlert className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              {company.data.warningsTitle}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => router.push("/chat")}>
            {company.data.upload.continueToQuestions}
          </Button>
          <Button variant="ghost" onClick={() => setQueue([])}>
            {company.data.upload.uploadAnother}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-bg-elevated p-6 shadow-sm">
      <h2 className="font-display text-lg font-bold text-ink">{company.data.upload.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{company.data.upload.body}</p>

      <div className="mt-5 rounded-control border border-line bg-bg p-5">
        <p className="text-sm font-semibold text-ink">{company.data.reportTypes.title}</p>
        <p className="mt-1 text-xs text-ink-subtle">{company.data.reportTypes.body}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {company.data.reportTypes.items.map((item) => (
            <li key={item.key} className="rounded-control border border-line bg-bg-elevated p-3">
              <p className="text-sm font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs font-semibold text-brand">{company.data.reportTypes.allLabel}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative mt-5 rounded-control border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-brand bg-brand-soft" : "border-line bg-bg",
        )}
      >
        <Upload className="mx-auto size-8 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
        <p className="mt-3 text-sm text-ink-muted">{company.data.upload.dropzone}</p>
        <input
          type="file"
          accept=".csv,.tsv,.xlsx"
          multiple
          className="sr-only"
          id="data-file-input"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            // Reset so re-picking the same file fires `change` again.
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          className="mt-4"
          disabled={busy}
          onClick={() => document.getElementById("data-file-input")?.click()}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {company.data.upload.uploading}
            </>
          ) : (
            company.data.upload.chooseFile
          )}
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-subtle">{company.data.constraints}</p>

      {error ? <ErrorNote message={error} onDismiss={() => setError(null)} /> : null}

      <div className="mt-6 border-t border-line pt-5">
        <Button variant="ghost" onClick={() => void skip()} disabled={busy}>
          {company.data.skip}
        </Button>
        <p className="mt-2 text-xs text-ink-subtle">{company.data.skipHint}</p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-ink-subtle uppercase">{label}</dt>
      <dd className="mt-1 font-display text-lg font-bold text-ink">{value}</dd>
    </div>
  );
}

function ErrorNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-negative/30 bg-negative-soft p-3">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-negative" strokeWidth={2} aria-hidden="true" />
      <p className="flex-1 text-sm text-negative">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={company.data.dismiss}
        className="cursor-pointer rounded-sm p-1 text-negative hover:bg-negative/10"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
