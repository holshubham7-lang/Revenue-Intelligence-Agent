"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatPercent,
  formatRelativeScanTime,
} from "@/lib/revenue";

type Finding = {
  id: string;
  layer?: string;
  title: string;
  summary?: string;
  severity: "low" | "medium" | "high";
  trend?: "up" | "down" | "flat" | "mixed";
  metrics?: {
    previous?: number;
    current?: number;
    delta?: number;
    pct?: number;
  };
  keyEntities?: Array<{
    entityType: string;
    name?: string;
    before?: number;
    after?: number;
  }>;
  recommendations?: string[];
  enginesUsed?: Array<"ai" | "rule">;
  dismissed?: boolean;
  createdAt?: string;
};

type HealthChange = {
  diffType: "added" | "removed" | "modified";
  entityType?: string;
  name?: string;
  previousAmount?: number;
  newAmount?: number;
  previousStage?: string;
  newStage?: string;
  severity: "low" | "medium" | "high";
  significance?: string;
  notes?: string;
  reviewed?: boolean;
  detectedAt?: string;
  snapshotSeq?: number;
};

type ConnectionDetail = {
  connectorSlug: string;
  connector?: {
    name?: string;
    mark?: string;
    brandColor?: string;
    iconUrl?: string;
    capabilities?: string[];
  };
  status?: string;
  lastSyncedAt?: string;
  createdAt?: string;
};

type Snapshot = {
  id: string;
  seq: number;
  snapshotTimestamp?: string;
  summary?: {
    totalRecords?: number;
    totalAmount?: number;
    entityTypes?: Array<{ entityType: string; count: number; amount: number }>;
  };
};

const SEVERITY_META: Record<Finding["severity"], { label: string; tone: string }> = {
  high: { label: "High", tone: "bg-danger-100 text-danger-700" },
  medium: { label: "Medium", tone: "bg-amber-100 text-amber-700" },
  low: { label: "Low", tone: "bg-surface-muted text-ink-muted" },
};

const LAYER_LABELS: Record<string, string> = {
  summary: "Overview",
  growth: "Growth",
  units: "Volume",
  contract: "Stages & deals",
  default: "General",
};

type SeverityFilter = "all" | "high" | "medium+";

export function WhatChanged({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionDetail | null>(null);
  const [changes, setChanges] = useState<HealthChange[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [connectionRes, changesRes, intelRes, snapshotsRes] =
          await Promise.all([
            fetch(`${API_URL}/connections/${connectionId}`, {
              credentials: "include",
            }),
            fetch(`${API_URL}/changes/connections/${connectionId}/recent`, {
              credentials: "include",
            }),
            fetch(
              `${API_URL}/revenue-intelligence/connections/${connectionId}`,
              { credentials: "include" },
            ),
            fetch(`${API_URL}/snapshots/connections/${connectionId}`, {
              credentials: "include",
            }),
          ]);
        if (connectionRes.status === 401 || changesRes.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (
          !connectionRes.ok ||
          !changesRes.ok ||
          !intelRes.ok ||
          !snapshotsRes.ok
        ) {
          setStatus("error");
          setError("Unable to load this app’s changes.");
          return;
        }
        const [connectionData, changesData, intelData, snapshotsData] =
          await Promise.all([
            connectionRes.json() as Promise<ConnectionDetail>,
            changesRes.json() as Promise<HealthChange[]>,
            intelRes.json() as Promise<{ findings: Finding[] }>,
            snapshotsRes.json() as Promise<Snapshot[]>,
          ]);
        setConnection(connectionData);
        setChanges(changesData);
        setFindings(intelData.findings ?? []);
        setSnapshot(snapshotsData[0] ?? null);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, [connectionId, reloadNonce]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const response = await fetch(
        `${API_URL}/revenue-intelligence/connections/${connectionId}/analyze`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        toast({
          title: "Analysis could not run",
          description: "Please try again in a moment.",
          variant: "error",
        });
        return;
      }
      const data = (await response.json()) as { findings: Finding[] };
      setFindings(data.findings);
      toast({
        title: "Analysis complete",
        description:
          data.findings.length > 0
            ? `${data.findings.length} findings on this snapshot.`
            : "No findings yet — refresh the app data first.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "error",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreatePlan(finding: Finding) {
    setCreatingPlan(true);
    try {
      const response = await fetch(`${API_URL}/action-plans`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          title: finding.title,
          summary: finding.summary,
          findingIds: [finding.id],
          recommendations: finding.recommendations ?? [],
        }),
      });
      if (!response.ok) {
        toast({
          title: "Could not create an action plan",
          description: "Please try again in a moment.",
          variant: "error",
        });
        return;
      }
      const data = (await response.json()) as { id: string };
      toast({
        title: "Action plan created",
        description: "Open it to apply the next steps.",
        variant: "success",
      });
      router.push(`/dashboard/action-plans/${data.id}`);
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "error",
      });
    } finally {
      setCreatingPlan(false);
    }
  }

  const visibleChanges = useMemo(() => {
    if (filter === "all") return changes;
    if (filter === "high") return changes.filter((c) => c.severity === "high");
    return changes.filter((c) => c.severity !== "low");
  }, [changes, filter]);

  if (status !== "ready") {
    return (
      <DashboardLayout>
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div className="mx-auto w-full max-w-5xl">
            {status === "loading" && <WhatChangedSkeleton />}
            {status === "unauthenticated" && (
              <InlineEmpty
                title="Sign in required"
                body="Sign in to review your revenue changes."
                actionLabel="Go to dashboard"
                onAction={() => router.push("/dashboard")}
              />
            )}
            {status === "error" && (
              <InlineEmpty
                title="Something went wrong"
                body={error}
                actionLabel="Try again"
                onAction={() => setReloadNonce((nonce) => nonce + 1)}
              />
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const name = connection?.connector?.name ?? connection?.connectorSlug;
  const summary = snapshot?.summary;

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <Link
            href="/dashboard/connected-apps"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-700"
          >
            <Icon name="arrow-left" size={16} />
            Connected apps
          </Link>

          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              {connection?.connector?.iconUrl ? (
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line">
                  <img
                    src={connection.connector.iconUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                </span>
              ) : (
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{
                    backgroundColor:
                      connection?.connector?.brandColor ?? "#34744e",
                  }}
                >
                  {connection?.connector?.mark ??
                    name?.slice(0, 2).toUpperCase() ??
                    "?"}
                </span>
              )}
              <div>
                <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                  {name}
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  What changed since the last refresh.
                  {connection?.lastSyncedAt
                    ? ` Last synced ${formatRelativeScanTime(connection.lastSyncedAt)}.`
                    : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={analyzing}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="spark" size={16} />
              {analyzing ? "Analyzing…" : "Run analysis"}
            </button>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Pipeline records"
              value={String(summary?.totalRecords ?? 0)}
              hint={`${formatRelativeScanTime(snapshot?.snapshotTimestamp ?? new Date())}`}
            />
            <StatCard
              label="Total pipeline value"
              value={formatCurrency(summary?.totalAmount)}
              hint="Normalized revenue baseline"
            />
            <StatCard
              label="Data types"
              value={String(summary?.entityTypes?.length ?? 0)}
              hint="Synced from this connector"
            />
          </div>

          {findings.length > 0 && (
            <section aria-labelledby="findings-heading" className="mb-10">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2
                  id="findings-heading"
                  className="text-sm font-bold uppercase tracking-[0.12em] text-ink-faint"
                >
                  Intelligence findings
                </h2>
                {findings[0]?.enginesUsed?.some((e) => e === "rule") ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                    <Icon name="spark" size={13} />
                    Rule-based — Run analysis for AI summaries
                  </span>
                ) : null}
              </div>

              <div className="space-y-4">
                {findings.map((finding) => {
                  const severity = SEVERITY_META[finding.severity] ?? SEVERITY_META.low;
                  const layerLabel = finding.layer
                    ? (LAYER_LABELS[finding.layer] ?? finding.layer)
                    : null;
                  const bigDelta =
                    finding.metrics &&
                    typeof finding.metrics.delta === "number" &&
                    Math.abs(finding.metrics.delta) > 0;
                  return (
                    <article
                      key={finding.id}
                      className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                            severity.tone,
                          )}
                        >
                          {severity.label}
                        </span>
                        {layerLabel ? (
                          <span className="inline-flex rounded-full border border-line-strong bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-muted">
                            {layerLabel}
                          </span>
                        ) : null}
                        {finding.trend ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[0.6875rem] font-semibold",
                              finding.trend === "up"
                                ? "text-brand-700"
                                : finding.trend === "down"
                                  ? "text-danger-600"
                                  : "text-ink-faint",
                            )}
                          >
                            <Icon
                              name={
                                finding.trend === "flat"
                                  ? "arrow-right"
                                  : finding.trend === "mixed"
                                    ? "layers"
                                    : "trend"
                              }
                              size={13}
                            />
                            {finding.trend}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-base font-bold tracking-[-0.01em] text-ink">
                        {finding.title}
                      </h3>
                      {finding.summary ? (
                        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                          {finding.summary}
                        </p>
                      ) : null}

                      {bigDelta && finding.metrics ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm">
                          <span className="text-ink-muted">
                            {formatCurrency(finding.metrics.previous)} →{" "}
                            <span className="font-semibold text-ink">
                              {formatCurrency(finding.metrics.current)}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "font-semibold",
                              (finding.metrics.delta ?? 0) >= 0
                                ? "text-brand-700"
                                : "text-danger-600",
                            )}
                          >
                            {formatCurrency(finding.metrics.delta)} (
                            {formatPercent(finding.metrics.pct)})
                          </span>
                        </div>
                      ) : null}

                      {(finding.keyEntities ?? []).length > 0 ? (
                        <ul className="mt-3 space-y-1">
                          {finding.keyEntities?.slice(0, 3).map((entity, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 text-xs text-ink-muted"
                            >
                              <span className="min-w-0 truncate">
                                {entity.name ?? entity.entityType}
                              </span>
                              <span className="shrink-0">
                                {entity.before !== undefined
                                  ? `${formatCurrency(entity.before)} → `
                                  : ""}
                                <span className="font-semibold text-ink">
                                  {formatCurrency(entity.after)}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {finding.recommendations &&
                      finding.recommendations.length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                          {finding.recommendations.map((rec, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-ink"
                            >
                              <Icon
                                name="check"
                                size={15}
                                className="mt-0.5 shrink-0 text-brand-600"
                              />
                              <span className="leading-relaxed">{rec}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void handleCreatePlan(finding)}
                        disabled={creatingPlan}
                        className="mt-4 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Icon name="action" size={14} />
                        {creatingPlan ? "Creating…" : "Create new action plan"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="changes-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2
                id="changes-heading"
                className="text-sm font-bold uppercase tracking-[0.12em] text-ink-faint"
              >
                Change feed · {changes.length}
              </h2>
              <div className="flex gap-2" role="group" aria-label="Filter changes">
                {(
                  [
                    { value: "all", label: "All" },
                    { value: "high", label: "High" },
                    { value: "medium+", label: "Medium +" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    aria-pressed={filter === item.value}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      filter === item.value
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line-strong bg-surface text-ink-muted hover:text-brand-700",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {visibleChanges.length === 0 ? (
              <InlineEmpty
                title="Nothing changed yet"
                body="Refresh the app to capture a new snapshot and compare it against the previous one."
              />
            ) : (
              <div className="space-y-2">
                {visibleChanges.map((change, index) => {
                  const isAdded = change.diffType === "added";
                  const isRemoved = change.diffType === "removed";
                  const tone =
                    SEVERITY_META[change.severity] ?? SEVERITY_META.low;
                  return (
                    <article
                      key={index}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border border-line bg-surface p-4",
                        change.severity === "high"
                          ? "border-danger-200/70"
                          : "border-line",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          isAdded
                            ? "bg-brand-100 text-brand-700"
                            : isRemoved
                              ? "bg-surface-muted text-ink-muted"
                              : "bg-amber-100 text-amber-700",
                        )}
                      >
                        <Icon name={isAdded ? "plus" : isRemoved ? "close" : "edit"} size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">
                            {change.name ?? change.entityType ?? "Record"}
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                              tone.tone,
                            )}
                          >
                            {tone.label}
                          </span>
                          <span className="text-xs capitalize text-ink-faint">
                            {change.diffType}
                            {change.entityType ? ` · ${change.entityType}` : ""}
                          </span>
                        </div>
                        {change.significance ? (
                          <p className="mt-1 text-sm text-ink-muted">
                            {change.significance}
                          </p>
                        ) : null}
                        {change.notes ? (
                          <p className="mt-0.5 text-xs text-ink-faint">
                            {change.notes}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[0.6875rem] text-ink-faint">
                          {change.detectedAt ? formatRelativeScanTime(change.detectedAt) : "—"} ·{" "}
                          snapshot {change.snapshotSeq}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-[-0.02em] text-ink">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function WhatChangedSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading what changed">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-line bg-surface"
          />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-2xl border border-line bg-surface"
        />
      ))}
    </div>
  );
}

function InlineEmpty({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-muted text-ink-faint">
        <Icon name="chart" size={24} />
      </span>
      <h2 className="mt-4 text-base font-bold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
        {body}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}