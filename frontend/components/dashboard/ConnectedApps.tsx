"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatRelativeScanTime } from "@/lib/revenue";

type Plugin = {
  slug: string;
  name: string;
  description?: string;
  category: string;
  mark?: string;
  brandColor?: string;
  iconUrl?: string;
  source: string;
  connected: boolean;
};

type Connection = {
  id: string;
  connectorSlug: string;
  connector?: {
    name?: string;
    mark?: string;
    brandColor?: string;
    iconUrl?: string;
    category?: string;
    capabilities?: string[];
  };
  status: string;
  hydratedDataStatus?: string;
  accountName?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
  updatedAt?: string;
};

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-amber-100 text-amber-700" },
  active: { label: "Connected", tone: "bg-brand-100 text-brand-700" },
  syncing: { label: "Syncing", tone: "bg-blue-100 text-blue-700" },
  expired: { label: "Expired", tone: "bg-surface-muted text-ink-muted" },
  stale: { label: "Stale", tone: "bg-amber-100 text-amber-700" },
  revoking: { label: "Removing", tone: "bg-surface-muted text-ink-muted" },
  revoked: { label: "Revoked", tone: "bg-surface-muted text-ink-faint" },
  error: { label: "Error", tone: "bg-danger-100 text-danger-700" },
};

export function ConnectedApps() {
  const router = useRouter();
  const { toast } = useToast();

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [refreshBusy, setRefreshBusy] = useState<string | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("connect");
    const connector = params.get("connector");
    if (outcome) {
      if (outcome === "success") {
        toast({
          title: "Connected",
          description: `${connector ?? "App"} linked successfully.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Connection failed",
          description:
            params.get("error") ??
            `${connector ?? "That app"} could not be connected.`,
          variant: "error",
        });
      }
      void router.replace("/dashboard/connected-apps");
    }
  }, [router, toast]);

  useEffect(() => {
    async function load() {
      try {
        const [pluginsRes, connectionsRes] = await Promise.all([
          fetch(`${API_URL}/plugins`, { credentials: "include" }),
          fetch(`${API_URL}/connections`, { credentials: "include" }),
        ]);
        if (pluginsRes.status === 401 || connectionsRes.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!pluginsRes.ok || !connectionsRes.ok) {
          setStatus("error");
          setError("Unable to load your connected apps.");
          return;
        }
        const [pluginData, connectionData] = await Promise.all([
          pluginsRes.json() as Promise<Plugin[]>,
          connectionsRes.json() as Promise<Connection[]>,
        ]);
        setPlugins(pluginData);
        setConnections(connectionData);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, []);

  const catalogBySlug = useMemo(
    () => new Map(plugins.map((p) => [p.slug, p])),
    [plugins],
  );

  const connectedCount = connections.filter((c) =>
    ["active", "syncing", "pending", "stale"].includes(c.status),
  ).length;

  const connectedConnections = connections.filter(
    (c) => !["revoked", "error", "pending"].includes(c.status),
  );

  const availablePluginSlugs = new Set(
    connectedConnections.map((c) => c.connectorSlug),
  );
  const availablePlugins = plugins.filter((p) => !availablePluginSlugs.has(p.slug));

  async function handleConnect(plugin: Plugin) {
    setConnectBusy(plugin.slug);
    try {
      const response = await fetch(
        `${API_URL}/plugins/${plugin.slug}/connect`,
        { method: "POST", credentials: "include" },
      );
      if (response.status === 401) {
        toast({
          title: "Session expired",
          description: "Please sign in again to connect apps.",
          variant: "error",
        });
        return;
      }
      if (!response.ok) {
        const detail = (await response
          .json()
          .catch(() => null)) as { message?: string } | null;
        toast({
          title: "Could not connect",
          description:
            detail?.message ?? "Please try again in a moment.",
          variant: "error",
        });
        return;
      }
      const data = (await response.json()) as { authUrl?: string };
      if (data.authUrl) {
        window.location.assign(data.authUrl);
      } else {
        toast({
          title: "Connection started",
          description: `${plugin.name} will be connected shortly.`,
        });
      }
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "error",
      });
    } finally {
      setConnectBusy(null);
    }
  }

  async function handleRefresh(connection: Connection) {
    setRefreshBusy(connection.id);
    try {
      const response = await fetch(
        `${API_URL}/data-sync/connections/${connection.id}/refresh`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        toast({
          title: "Refresh could not start",
          description: "Please try again in a moment.",
          variant: "error",
        });
        return;
      }
      const data = (await response.json()) as {
        status: string;
        message?: string;
        changeSummary?: { added: number; removed: number; modified: number };
      };
      if (data.status === "already-running") {
        toast({
          title: "Already syncing",
          description: "A refresh is already in progress for this app.",
          variant: "info",
        });
        return;
      }
      if (data.status === "success") {
        const changes = data.changeSummary;
        const detail =
          changes && (changes.added + changes.removed + changes.modified) > 0
            ? `+${changes.added} new · ${changes.modified} changed · ${changes.removed} gone`
            : "No material changes detected.";
        toast({
          title: "Refresh complete",
          description: detail,
          variant: "success",
        });
      } else {
        toast({
          title: "Refresh failed",
          description: data.message ?? "The app could not be refreshed.",
          variant: "error",
        });
      }
      const res = await fetch(`${API_URL}/connections`, { credentials: "include" });
      if (res.ok) {
        setConnections((await res.json()) as Connection[]);
      }
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "error",
      });
    } finally {
      setRefreshBusy(null);
    }
  }

  async function handleDisconnect(connection: Connection) {
    const name = connection.connector?.name ?? connection.connectorSlug;
    if (!window.confirm(`Disconnect ${name}? Existing snapshots stay available.`)) {
      return;
    }
    setDisconnectBusy(connection.id);
    try {
      const response = await fetch(
        `${API_URL}/connections/${connection.id}/disconnect`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        toast({
          title: "Could not disconnect",
          description: "Please try again in a moment.",
          variant: "error",
        });
        return;
      }
      toast({
        title: "Disconnected",
        description: `${name} is no longer linked.`,
        variant: "info",
      });
      const res = await fetch(`${API_URL}/connections`, { credentials: "include" });
      if (res.ok) {
        setConnections((await res.json()) as Connection[]);
      }
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "error",
      });
    } finally {
      setDisconnectBusy(null);
    }
  }

  if (status !== "ready") {
    return (
      <DashboardLayout>
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div className="mx-auto w-full max-w-5xl">
            {status === "loading" && <ConnectedAppsSkeleton />}
            {status === "unauthenticated" && (
              <EmptyState
                title="Sign in required"
                body="Sign in to manage your connected revenue apps."
                actionLabel="Go to dashboard"
                onAction={() => router.push("/dashboard")}
              />
            )}
            {status === "error" && (
              <EmptyState
                title="Something went wrong"
                body={error}
                actionLabel="Try again"
                onAction={() => window.location.reload()}
              />
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
              <Icon name="link" size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                Connected Apps
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                Your read-only data sources. Refresh them anytime and open
                What Changed to see how your revenue moved.
              </p>
            </div>
          </div>

          <section aria-labelledby="connected-heading" className="mb-10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="connected-heading"
                className="text-sm font-bold uppercase tracking-[0.12em] text-ink-faint"
              >
                Connected · {connectedCount}
              </h2>
            </div>

            {connectedConnections.length === 0 ? (
              <EmptyState
                title="Nothing connected yet"
                body="Browse the marketplace below and link your first revenue tool."
              />
            ) : (
              <div className="space-y-3">
                {connectedConnections.map((connection) => {
                  const catalog = catalogBySlug.get(connection.connectorSlug);
                  const meta = connection.connector ?? {
                    name: catalog?.name,
                    mark: catalog?.mark,
                    brandColor: catalog?.brandColor,
                    iconUrl: catalog?.iconUrl,
                  };
                  const tone = STATUS_LABELS[connection.status] ?? STATUS_LABELS.error;
                  const busy =
                    refreshBusy === connection.id || disconnectBusy === connection.id;
                  return (
                    <article
                      key={connection.id}
                      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {meta?.iconUrl ? (
                          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line">
                            <img
                              src={meta.iconUrl}
                              alt=""
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          </span>
                        ) : (
                          <span
                            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                            style={{
                              backgroundColor: meta?.brandColor ?? "#34744e",
                            }}
                          >
                            {meta?.mark ?? meta?.name?.slice(0, 2).toUpperCase() ?? "?"}
                          </span>
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">
                            {meta?.name ?? connection.connectorSlug}
                          </h3>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                                tone.tone,
                              )}
                            >
                              {connection.status === "syncing" ? (
                                <Icon name="refresh" size={11} />
                              ) : null}
                              {tone.label}
                            </span>
                            <span>
                              {connection.lastSyncedAt
                                ? `Updated ${formatRelativeScanTime(connection.lastSyncedAt)}`
                                : "Not synced yet"}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/connected-apps/${connection.id}`}
                          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-xs font-semibold text-ink transition-colors hover:border-brand-300 hover:text-brand-700"
                        >
                          <Icon name="chart" size={15} />
                          What changed
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleRefresh(connection)}
                          disabled={busy || connection.status === "syncing"}
                          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Icon name="refresh" size={14} />
                          {refreshBusy === connection.id ? "Syncing…" : "Refresh"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(connection)}
                          disabled={busy}
                          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink-muted transition-colors hover:border-danger-300 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Disconnect ${meta?.name ?? connection.connectorSlug}`}
                        >
                          <Icon name="disconnect" size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="marketplace-heading">
            <div className="mb-3">
              <h2
                id="marketplace-heading"
                className="text-sm font-bold uppercase tracking-[0.12em] text-ink-faint"
              >
                Marketplace
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Link another tool to bring more of your revenue data into one
                view.
              </p>
            </div>

            {availablePlugins.length === 0 ? (
              <EmptyState
                title="All available apps are connected"
                body="New connectors appear here as they ship."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availablePlugins.map((plugin) => (
                  <article
                    key={plugin.slug}
                    className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {plugin.iconUrl ? (
                          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line">
                            <img
                              src={plugin.iconUrl}
                              alt=""
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          </span>
                        ) : (
                          <span
                            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                            style={{ backgroundColor: plugin.brandColor ?? "#34744e" }}
                          >
                            {plugin.mark ?? plugin.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="leading-tight">
                          <h3 className="text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">
                            {plugin.name}
                          </h3>
                          <p className="text-xs font-medium capitalize text-ink-muted">
                            {plugin.category}
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                      {plugin.description}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleConnect(plugin)}
                      disabled={connectBusy === plugin.slug}
                      className="mt-4 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {connectBusy === plugin.slug ? (
                        <>
                          <Icon name="refresh" size={14} className="animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        "Connect"
                      )}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ConnectedAppsSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading connected apps">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-5"
        >
          <div className="size-11 animate-pulse rounded-xl bg-surface-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-muted" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
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
        <Icon name="link" size={24} />
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