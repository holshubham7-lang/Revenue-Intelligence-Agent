"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Loader2, Paperclip, Trash2, TriangleAlert, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { getCsrfToken, postJson } from "@/lib/api/csrf-client";
import { company } from "@/lib/content";
import { cn } from "@/lib/utils";

const { files: copy } = company.chat;
/** The mapping and upload wording, shared verbatim with the upload screen. */
const { data } = company;

/** One stored report, as `GET /api/company/data-sources/list` reports it. */
export type SharedReport = {
  id: string;
  name: string;
  extension: string;
  sizeBytes: number;
  rowCount: number | null;
  status: "pending" | "parsing" | "ready" | "rejected" | "error";
  createdAt: string;
};

type ColumnProposal = {
  header: string;
  field: string | null;
  confidence: number;
  ambiguous: boolean;
};

/** Phase 1's response: the file is stored, the mapping is not confirmed yet. */
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

type QueueItem = {
  key: string;
  fileName: string;
  state: "uploading" | "mapping" | "analysing" | "done" | "failed";
  upload: UploadResult | null;
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
 * token, so the status check belongs to the caller. Accepting the error envelope
 * instead of throwing is what turns a `422 unmappable_columns` into a crash when
 * a later screen reads `.metrics.totalRecords` off it.
 */
async function readJsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) throw new Error(body?.error?.message ?? fallback);
  if (!body) throw new Error(fallback);
  return body;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ChatFilesPanelProps = {
  /**
   * Reports the server already had when this paint started. Passed in rather
   * than fetched on mount so the panel is populated on the first paint, which
   * matters because the note it replaces is decided server-side from the same list.
   */
  initialReports: SharedReport[];
  /**
   * Told how many reports exist whenever the panel changes that number, so the
   * chat's first-run note can disappear the moment a file is added.
   */
  onCountChange?: (count: number) => void;
  /** Rendered as a dialog on mobile; hidden entirely when false. */
  onClose?: () => void;
  /** Hides the panel heading row, which the drawer supplies itself. */
  showHeading?: boolean;
};

/**
 * The reports this company has shared, beside the conversation.
 *
 * This was the "Data sources" page: a full screen between company registration
 * and the assistant, reachable from the navigation. It is a panel here because
 * the reports are not a destination — they are the input to whatever the user is
 * asking about. Uploading and then having to navigate somewhere else to read the
 * answer is the split that this removes.
 *
 * The upload is the same two-phase pipeline the page used, on purpose. Phase one
 * stores the file and proposes a column mapping; phase two confirms it and runs
 * the analysis. Mapping cannot be inferred safely — `Amount` and `ARR` both look
 * like a value column and mean different things — so the confirmation is one
 * decision per file, which is why a queue is walked one file at a time.
 *
 * Upload posts with `fetch` rather than `postJson` because this is
 * `multipart/form-data` and that helper sends JSON. The CSRF token travels as a
 * header, which the double-submit check accepts: a custom header is safe
 * alongside FormData, only `Content-Type` is reserved because `fetch` must set it
 * to add the multipart boundary.
 */
export function ChatFilesPanel({
  initialReports,
  onCountChange,
  onClose,
  showHeading = true,
}: ChatFilesPanelProps) {
  const [reports, setReports] = useState<SharedReport[]>(initialReports);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [columns, setColumns] = useState<ColumnProposal[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The file the user is looking at. `analysing` is included so the mapping table
   * stays mounted while it works — they can still see what they confirmed and
   * correct it if the result comes back with a problem.
   */
  const active = queue.find((item) => item.state === "mapping" || item.state === "analysing") ?? null;

  const publish = useCallback(
    (next: SharedReport[]) => {
      setReports(next);
      onCountChange?.(next.length);
    },
    [onCountChange],
  );

  /**
   * Best-effort list refresh. A refresh that fails leaves the rows already on
   * screen, which is better than replacing the panel with an error.
   */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/company/data-sources/list", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { files?: SharedReport[] };
      if (Array.isArray(data.files)) publish(data.files);
    } catch {
      // Keep the rows already on screen.
    }
  }, [publish]);

  /**
   * `multipart/form-data` upload. Uses `fetch` rather than `postJson` because
   * that helper sends JSON; the token rides as a header, which the double-submit
   * check accepts.
   */
  const send = useCallback(async (input: string, init: RequestInit): Promise<Response> => {
    const token = await getCsrfToken();
    return fetch(input, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { "X-CSRF-Token": token },
    });
  }, []);

  function update(key: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

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

  /**
   * Uploads each selected file in turn.
   *
   * Sequential on purpose: each upload carries its own mapping proposal to review,
   * and firing four at once would mean four proposals in flight with one table to
   * review them on. A failure is recorded against its own file and the rest of the
   * queue keeps moving — one unreadable export shouldn't cost the other three.
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
      error: null,
    }));

    setQueue((prev) => [...prev, ...queued]);

    const settled = new Map<string, QueueItem>();

    for (const [index, item] of queued.entries()) {
      try {
        const form = new FormData();
        form.append("file", list[index]);

        const res = await send("/api/company/data-sources", { method: "POST", body: form });
        const result = await readJsonOrThrow<UploadResult>(res, "That upload didn't work.");

        settled.set(item.key, { ...item, state: "mapping", upload: result });
      } catch (err) {
        settled.set(item.key, {
          ...item,
          state: "failed",
          error: err instanceof Error ? err.message : "That upload didn't work.",
        });
      }
    }

    // One state write, so the queue never renders half-updated and the first
    // mapping is available on the very next render.
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
      await readJsonOrThrow(res, "Couldn't analyse that file.");

      update(active.key, { state: "done" });
      loadNextMapping(active.key);
      await refresh();
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
   * fetch that sheet's headers — otherwise the user confirms one sheet's mapping
   * against another sheet's columns and the server rejects a confirmation the UI
   * made look valid.
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

  async function remove(report: SharedReport) {
    if (!window.confirm(copy.removeConfirm.replace("{name}", report.name))) return;

    setRemoving(report.id);
    setError(null);
    // Optimistic: the row disappears on click so a slow delete doesn't read as a
    // dead button. A failure restores it, because a file that is still stored and
    // still being answered from must not look deleted.
    publish(reports.filter((file) => file.id !== report.id));

    try {
      const token = await getCsrfToken();
      const response = await fetch(
        `/api/company/data-sources/list?id=${encodeURIComponent(report.id)}`,
        { method: "DELETE", headers: { "X-CSRF-Token": token }, credentials: "include" },
      );
      if (!response.ok) throw new Error("remove failed");
    } catch {
      await refresh();
      setError(copy.removeFailed);
    } finally {
      setRemoving(null);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  // The mapping table owns the panel while a decision is outstanding: it is the
  // one thing that cannot be deferred, and a list behind it would invite the user
  // to answer a question about data that isn't analysed yet.
  if (active?.upload) {
    const analysing = active.state === "analysing";

    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 className="font-display text-sm font-bold text-ink">{data.mapping.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            {data.mapping.body
              .replace("{file}", active.upload.fileName)
              .replace("{rows}", active.upload.rowCount.toLocaleString())}
          </p>

          {active.upload.sheetNames.length > 1 ? (
            <label className="mt-4 block text-xs font-semibold text-ink">
              {data.mapping.sheetLabel}
              <select
                value={sheetName}
                onChange={(e) => void handleSheetChange(e.target.value)}
                disabled={busy}
                className="mt-1 block w-full rounded-control border border-line bg-bg px-2.5 py-2 text-sm font-normal text-ink"
              >
                {active.upload.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-4 space-y-2">
            {columns.map((column, index) => (
              <div key={`${column.header}-${index}`}>
                <p className="truncate text-xs font-semibold text-ink">
                  {column.header}
                  {column.ambiguous ? (
                    <span className="ml-1.5 rounded-sm bg-warning-soft px-1.5 py-0.5 text-[0.625rem] font-semibold text-warning">
                      {data.mapping.ambiguous}
                    </span>
                  ) : null}
                </p>
                <select
                  value={column.field ?? ""}
                  aria-label={`${data.mapping.columnLabel}: ${column.header}`}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    setColumns((prev) => {
                      // One column per field: choosing a field here clears it from
                      // any other column, so the server can't receive a duplicate
                      // it would have to reject.
                      const next = prev.map((c) =>
                        value && c.field === value && c.header !== column.header
                          ? { ...c, field: null }
                          : c,
                      );
                      return next.map((c, i) => (i === index ? { ...c, field: value } : c));
                    });
                  }}
                  disabled={busy}
                  className="mt-1 w-full rounded-control border border-line bg-bg px-2.5 py-1.5 text-xs text-ink"
                >
                  <option value="">{data.mapping.ignore}</option>
                  {FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                      {REQUIRED_FIELDS.has(option.value) ? " *" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{data.mapping.requiredHint}</p>

          {error ? <ErrorNote message={error} onDismiss={() => setError(null)} /> : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-line p-4">
          <Button variant="primary" size="sm" className="w-full" onClick={handleConfirm} disabled={busy}>
            {analysing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {data.mapping.analysing}
              </>
            ) : (
              data.mapping.confirm
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              // Dropping the file rather than silently ignoring it — a queue entry
              // the user can't get back to would strand them here.
              update(active.key, { state: "failed", error: data.mapping.discarded });
              loadNextMapping(active.key);
            }}
            disabled={busy}
          >
            {data.mapping.skipFile}
          </Button>
        </div>
      </div>
    );
  }

  const failed = queue.filter((item) => item.state === "failed");

  return (
    <div className="flex h-full flex-col">
      {showHeading ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="font-display text-sm font-bold text-ink">{copy.label}</h3>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={copy.closeLabel}
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {busy && queue.some((item) => item.state === "uploading") ? (
          <ul className="space-y-2" aria-live="polite">
            {queue.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-xs text-ink-muted">
                {item.state === "done" ? (
                  <Check className="size-3.5 shrink-0 text-brand" strokeWidth={2.5} aria-hidden="true" />
                ) : item.state === "failed" ? (
                  <TriangleAlert className="size-3.5 shrink-0 text-negative" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden="true" />
                )}
                <span className="truncate">{item.fileName}</span>
              </li>
            ))}
          </ul>
        ) : reports.length === 0 ? (
          <div className="rounded-control border border-line bg-bg-muted p-4 text-center">
            <Paperclip className="mx-auto size-5 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-ink">{copy.empty}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{copy.emptyHint}</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {reports.map((report) => (
              <li
                key={report.id}
                className="group flex items-center gap-2 rounded-control px-2 py-2 transition-colors hover:bg-bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-ink">
                    {report.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-subtle">
                    {report.rowCount === null
                      ? formatBytes(report.sizeBytes)
                      : copy.rowsLabel.replace("{count}", report.rowCount.toLocaleString())}
                  </span>
                </span>
                {removing === report.id ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-subtle" aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(report)}
                  disabled={removing === report.id}
                  aria-label={copy.removeLabel.replace("{name}", report.name)}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink-subtle transition-colors hover:bg-bg hover:text-negative disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {failed.length > 0 && !busy ? (
          <ul className="mt-3 space-y-1">
            {failed.map((item) => (
              <li key={item.key} className="text-xs leading-relaxed text-negative">
                {item.fileName}
                {item.error ? ` — ${item.error}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <ErrorNote message={error} onDismiss={() => setError(null)} /> : null}

        {/* Kept mounted and visually hidden rather than created on click: the
            button is a label for it, so a keyboard user reaches the file picker
            by tabbing to the label and pressing Space, exactly as with any other
            file input. */}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx"
          multiple
          className="sr-only"
          aria-label={copy.addLabel}
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            // Reset so re-picking the same file fires `change` again.
            e.target.value = "";
          }}
          disabled={busy}
        />
      </div>

      <div className="shrink-0 space-y-2 border-t border-line p-4">
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
            "rounded-control border-2 border-dashed p-3 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft" : "border-line bg-bg",
          )}
        >
          <Upload className="mx-auto size-5 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
          <Button
            variant="secondary"
            size="sm"
            className="mt-2.5 w-full"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {data.upload.uploading}
              </>
            ) : (
              <>
                <Paperclip className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                {copy.addLabel}
              </>
            )}
          </Button>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-ink-subtle">{copy.constraints}</p>
      </div>
    </div>
  );
}

function ErrorNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-control border border-negative/30 bg-negative-soft p-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-negative" strokeWidth={2} aria-hidden="true" />
      <p className="flex-1 text-xs leading-relaxed text-negative">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={copy.dismiss}
        className="cursor-pointer rounded-sm p-1 text-negative transition-colors hover:bg-negative/10"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}