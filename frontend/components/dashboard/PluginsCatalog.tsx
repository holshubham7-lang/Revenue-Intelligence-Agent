"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Plugin = {
  slug: string;
  name: string;
  description?: string;
  category: "crm" | "marketing" | "support" | "data" | "product";
  mark?: string;
  brandColor?: string;
  source: "builtin" | "foundry";
  authType?: string;
  iconUrl?: string;
  connected: boolean;
};

type Filters = "all" | Plugin["category"];

const FILTERS: Array<{ value: Filters; label: string }> = [
  { value: "all", label: "All" },
  { value: "crm", label: "CRM" },
  { value: "marketing", label: "Marketing" },
  { value: "support", label: "Support" },
  { value: "data", label: "Data" },
];

const CATEGORY_LABELS: Record<Plugin["category"], string> = {
  crm: "CRM",
  marketing: "Marketing",
  support: "Support",
  data: "Data",
  product: "Product",
};

export function PluginsCatalog() {
  const router = useRouter();
  const { toast } = useToast();

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filters>("all");

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
          setError("Unable to load the plugin catalog.");
          return;
        }
        const data = (await response.json()) as Plugin[];
        setPlugins(data);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, []);

const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (filter !== "all" && plugin.category !== filter) return false;
      if (!needle) return true;
      return (
        plugin.name.toLowerCase().includes(needle) ||
        (plugin.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [plugins, query, filter]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const supportsReveal = typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const slug = entry.target.getAttribute("data-slug");
          if (slug) {
            setRevealed((prev) =>
              prev.has(slug) ? prev : new Set(prev).add(slug),
            );
          }
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((card) =>
      observer.observe(card),
    );
    return () => observer.disconnect();
  }, [visible]);

  const connectedCount = plugins.filter((p) => p.connected).length;

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
            {status === "loading" && <CatalogSkeleton />}
            {status === "unauthenticated" && (
              <EmptyState
                title="Sign in required"
                body="Sign in to browse and connect your revenue tools."
                action={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
              />
            )}
            {status === "error" && (
              <EmptyState
                title="Something went wrong"
                body={error}
                action={{ label: "Try again", onClick: () => location.reload() }}
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
              <Icon name="plugin" size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                Connect your revenue stack
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                Browse the catalog below to link read-only data from the tools
                you already use. Connections are safe, encrypted, and only ever
                read.
              </p>
            </div>
          </div>

          {connectedCount > 0 && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-brand-200/70 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <Icon name="check" size={16} />
              <span>
                {connectedCount} connected{" "}
                {connectedCount === 1 ? "plugin" : "plugins"} — data will be
                synced into your revenue analysis.
              </span>
            </div>
          )}

          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
                <Icon name="search" size={18} />
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search plugins…"
                aria-label="Search plugins"
                className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  aria-pressed={filter === item.value}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold tracking-[-0.01em] transition-colors",
                    filter === item.value
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-line-strong bg-surface text-ink-muted hover:border-brand-400 hover:text-brand-700",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="No plugins found"
              body={`Nothing matches “${query}” in this category. Try a different search.`}
            />
          ) : (
            <div
              ref={gridRef}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {visible.map((plugin, index) => {
                const isRevealed = !supportsReveal || revealed.has(plugin.slug);
                return (
                  <article
                    key={plugin.slug}
                    data-reveal
                    data-slug={plugin.slug}
                    style={
                      isRevealed
                        ? undefined
                        : { transitionDelay: `${Math.min(index, 8) * 40}ms` }
                    }
                    className={cn(
                      "flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                      isRevealed
                        ? "translate-y-0 opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100"
                        : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
                    )}
                  >
                    <PluginCardInner
                      plugin={plugin}
                      onConnect={() => handleConnect(plugin)}
                      onToast={() =>
                        toast({
                          title: "Read-only data",
                          description: `${plugin.name} is only ever read — we never write to your tools.`,
                          variant: "info",
                        })
                      }
                    />
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function PluginCardInner({
  plugin,
  onConnect,
  onToast,
}: {
  plugin: Plugin;
  onConnect: () => void;
  onToast: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-[-0.01em] text-white"
              style={{ backgroundColor: plugin.brandColor ?? "#34744e" }}
            >
              {plugin.mark ?? plugin.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="leading-tight">
            <h3 className="text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">
              {plugin.name}
            </h3>
            <p className="text-xs font-medium text-ink-muted">
              {CATEGORY_LABELS[plugin.category]}
              {plugin.source === "builtin" ? " · Built-in" : " · Catalog"}
            </p>
          </div>
        </div>
        {plugin.connected && (
          <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[0.6875rem] font-bold text-brand-700">
            <Icon name="check" size={12} />
            Connected
          </span>
        )}
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
        {plugin.description}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToast}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-faint transition-colors hover:text-brand-700"
        >
          <Icon name="shield" size={15} />
          Read-only
        </button>

        <button
          type="button"
          onClick={onConnect}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Connect
        </button>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading plugins">
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
          <div className="mt-4 h-4 w-full animate-pulse rounded bg-surface-muted/60" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-muted text-ink-faint">
        <Icon name="plugin" size={24} />
      </span>
      <h2 className="mt-4 text-base font-bold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}