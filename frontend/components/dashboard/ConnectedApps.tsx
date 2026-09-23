"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { API_URL } from "@/lib/constants";

export type Plugin = {
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

export function ConnectedApps() {
  const router = useRouter();
  const { toast } = useToast();

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error"
  >("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${API_URL}/plugins`, {
          credentials: "include",
        });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          setError("Unable to load the plugin list.");
          return;
        }
        setPlugins((await response.json()) as Plugin[]);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, []);

  const sortedPlugins = useMemo(
    () => [...plugins].sort((a, b) => a.name.localeCompare(b.name)),
    [plugins],
  );

  function handleConnect(plugin: Plugin) {
    toast({
      title: "Connection is not done yet",
      description: `${plugin.name} will be available to link soon.`,
      variant: "info",
    });
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
                body="Sign in to browse available integrations."
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
                Browse the integrations available for your revenue stack.
              </p>
            </div>
          </div>

          <section aria-labelledby="marketplace-heading">
            <div className="mb-3">
              <h2
                id="marketplace-heading"
                className="text-sm font-bold uppercase tracking-[0.12em] text-ink-faint"
              >
                Marketplace
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                New integrations appear here as they ship.
              </p>
            </div>

            {sortedPlugins.length === 0 ? (
              <EmptyState
                title="No integrations available yet"
                body="New connections will appear here soon."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedPlugins.map((plugin) => (
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
                      className="mt-4 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      Connect
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading connected apps">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex h-44 flex-col rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-xl bg-surface-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-muted" />
              <div className="h-2.5 w-2/5 animate-pulse rounded bg-surface-muted" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2.5 w-full animate-pulse rounded bg-surface-muted" />
            <div className="h-2.5 w-4/5 animate-pulse rounded bg-surface-muted" />
          </div>
          <div className="mt-4 h-8 w-full animate-pulse rounded bg-surface-muted/60" />
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