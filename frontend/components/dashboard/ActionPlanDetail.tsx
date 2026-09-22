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

type Plan = {
  id: string;
  title: string;
  summary?: string;
  status: "draft" | "open" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high";
  phase?: string;
  adopted?: boolean;
  connectionId?: string;
  findingIds?: string[];
  createdAt?: string;
};

type PlanItem = {
  id: string;
  entityType?: string;
  sourceKey?: string;
  action?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  status: "pending" | "applied" | "in_progress" | "updated" | "cancelled";
  notes?: string;
  appliedValue?: number;
};

const PLAN_STATUS_OPTIONS: Array<{
  status: Plan["status"];
  label: string;
  tone: string;
}> = [
  { status: "open", label: "Open", tone: "bg-brand-100 text-brand-700" },
  {
    status: "in_progress",
    label: "In progress",
    tone: "bg-blue-100 text-blue-700",
  },
  { status: "done", label: "Done", tone: "bg-brand-100 text-brand-700" },
  { status: "cancelled", label: "Cancelled", tone: "bg-surface-muted text-ink-faint" },
];

const ITEM_STATUS: Record<PlanItem["status"], { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-amber-100 text-amber-700" },
  applied: { label: "Applied", tone: "bg-brand-100 text-brand-700" },
  in_progress: { label: "In progress", tone: "bg-blue-100 text-blue-700" },
  updated: { label: "Updated", tone: "bg-surface-muted text-ink-muted" },
  cancelled: { label: "Cancelled", tone: "bg-surface-muted text-ink-faint" },
};

export function ActionPlanDetail({ planId }: { planId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error" | "missing"
  >("loading");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [committingItem, setCommittingItem] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [planRes, itemsRes] = await Promise.all([
          fetch(`${API_URL}/action-plans/${planId}`, { credentials: "include" }),
          fetch(`${API_URL}/action-plans/${planId}/items`, {
            credentials: "include",
          }),
        ]);
        if (planRes.status === 401 || itemsRes.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (planRes.status === 404) {
          setStatus("missing");
          return;
        }
        if (!planRes.ok || !itemsRes.ok) {
          setStatus("error");
          setError("Unable to load this action plan.");
          return;
        }
        const [planData, itemsData] = await Promise.all([
          planRes.json() as Promise<Plan>,
          itemsRes.json() as Promise<PlanItem[]>,
        ]);
        setPlan(planData);
        setItems(itemsData);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, [planId, reloadNonce]);

  const appliedCount = useMemo(
    () => items.filter((item) => item.status === "applied").length,
    [items],
  );

  async function updateItemStatus(itemId: string, nextStatus: PlanItem["status"]) {
    setSavingItem(itemId);
    try {
      const response = await fetch(
        `${API_URL}/action-plans/${planId}/items/${itemId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!response.ok) {
        toast({ title: "Could not update step", variant: "error" });
        return;
      }
      const data = (await response.json()) as PlanItem;
      setItems((current) =>
        current.map((item) => (item.id === itemId ? { ...item, ...data } : item)),
      );
      toast({ title: "Step updated", variant: "success" });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setSavingItem(null);
    }
  }

  async function commitItem(itemId: string) {
    setCommittingItem(itemId);
    try {
      const response = await fetch(
        `${API_URL}/action-plans/${planId}/items/${itemId}/commit`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        toast({ title: "Could not commit step", variant: "error" });
        return;
      }
      const data = (await response.json()) as PlanItem;
      setItems((current) =>
        current.map((item) => (item.id === itemId ? { ...item, ...data } : item)),
      );
      toast({ title: "Step marked as applied", variant: "success" });
      setReloadNonce((nonce) => nonce + 1);
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setCommittingItem(null);
    }
  }

  async function updatePlanStatus(nextStatus: Plan["status"]) {
    if (!plan) return;
    setSavingStatus(plan.id);
    try {
      const response = await fetch(`${API_URL}/action-plans/${plan.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        toast({ title: "Could not update plan", variant: "error" });
        return;
      }
      setPlan((current) => (current ? { ...current, status: nextStatus } : current));
      toast({ title: "Plan updated", variant: "success" });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setSavingStatus(null);
    }
  }

  async function addItem() {
    if (!action.trim()) return;
    setAddingItem(true);
    try {
      const response = await fetch(
        `${API_URL}/action-plans/${planId}/items`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: action.trim() }),
        },
      );
      if (!response.ok) {
        toast({ title: "Could not add step", variant: "error" });
        return;
      }
      const data = (await response.json()) as PlanItem;
      setItems((current) => [...current, data]);
      setAction("");
      toast({ title: "Step added", variant: "success" });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setAddingItem(false);
    }
  }

  if (status !== "ready") {
    return (
      <DashboardLayout>
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div className="mx-auto w-full max-w-5xl">
            {status === "loading" && (
              <div
                className="space-y-4"
                aria-label="Loading action plan"
              >
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-2xl border border-line bg-surface"
                  />
                ))}
              </div>
            )}
            {status === "missing" && (
              <InlineEmpty
                title="Plan not found"
                body="This action plan may have been deleted."
                actionLabel="Browse all plans"
                onAction={() => router.push("/dashboard/action-plans")}
              />
            )}
            {status === "unauthenticated" && (
              <InlineEmpty
                title="Sign in required"
                body="Sign in to manage this action plan."
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

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <Link
            href="/dashboard/action-plans"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-700"
          >
            <Icon name="arrow-left" size={16} />
            Action plans
          </Link>

          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                    PLAN_STATUS_OPTIONS.find((o) => o.status === plan?.status)
                      ?.tone ?? "bg-surface-muted text-ink-muted",
                  )}
                >
                  {PLAN_STATUS_OPTIONS.find((o) => o.status === plan?.status)
                    ?.label ?? plan?.status}
                </span>
                {plan?.phase ? (
                  <span className="rounded-full border border-line-strong bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-semibold capitalize text-ink-muted">
                    {plan.phase}
                  </span>
                ) : null}
                <span className="text-xs capitalize text-ink-faint">
                  {plan?.priority} priority
                </span>
              </div>
              <h1 className="mt-2 text-xl font-bold tracking-[-0.02em] text-ink">
                {plan?.title}
              </h1>
              {plan?.summary ? (
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                  {plan.summary}
                </p>
              ) : null}
              {plan?.connectionId ? (
                <Link
                  href={`/dashboard/connected-apps/${plan.connectionId}`}
                  className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  View underlying data
                </Link>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {PLAN_STATUS_OPTIONS.filter((option) => option.status !== plan?.status).map(
                (option) => (
                  <button
                    key={option.status}
                    type="button"
                    onClick={() => plan && updatePlanStatus(option.status)}
                    disabled={savingStatus === plan?.id}
                    className="cursor-pointer rounded-xl border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mark {option.label.toLowerCase()}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="mb-8 rounded-2xl border border-brand-200/70 bg-brand-50 p-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-bold text-brand-700">Progress</p>
                <p className="mt-0.5 text-xs text-brand-700/70">
                  {appliedCount} of {items.length} steps applied
                </p>
              </div>
              <p className="text-xl font-bold tracking-[-0.02em] text-brand-700">
                {items.length > 0 ? Math.round((appliedCount / items.length) * 100) : 0}%
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-500"
                style={{
                  width: `${items.length > 0 ? (appliedCount / items.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <section aria-labelledby="steps-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="steps-heading"
                className="text-sm font-bold uppercase tracking-[0.12em] text-ink-faint"
              >
                Steps · {items.length}
              </h2>
              {plan?.createdAt ? (
                <span className="text-xs text-ink-faint">
                  Created {formatRelativeScanTime(plan.createdAt)}
                </span>
              ) : null}
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
                <p className="text-sm font-semibold text-ink">No steps yet</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Add the first concrete action below.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const meta = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending;
                  const isApplied = item.status === "applied";
                  return (
                    <article
                      key={item.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
                        isApplied
                          ? "border-brand-200/70 bg-brand-50/40"
                          : "border-line bg-surface",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          aria-label={
                            isApplied ? "Mark step as pending" : "Mark step as applied"
                          }
                          onClick={() =>
                            commitItem(item.id)
                          }
                          disabled={committingItem === item.id}
                          className={cn(
                            "mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            isApplied
                              ? "border-brand-600 bg-brand-600 text-white"
                              : "border-line-strong text-transparent hover:border-brand-400",
                          )}
                        >
                          <Icon name="check" size={12} />
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">
                            {item.action}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {item.entityType ? `${item.entityType} · ` : ""}
                            {item.sourceKey ?? "General"}
                            {item.notes ? ` — ${item.notes}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                            meta.tone,
                          )}
                        >
                          {meta.label}
                        </span>
                        <select
                          aria-label={`Change status for step ${item.id}`}
                          value={item.status}
                          onChange={(event) =>
                            updateItemStatus(
                              item.id,
                              event.target.value as PlanItem["status"],
                            )
                          }
                          disabled={savingItem === item.id}
                          className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink outline-none transition-colors focus:border-brand-400 disabled:opacity-50"
                        >
                          {Object.keys(ITEM_STATUS).map((statusKey) => (
                            <option key={statusKey} value={statusKey}>
                              {ITEM_STATUS[statusKey as PlanItem["status"]].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                void addItem();
              }}
            >
              <input
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="Add a step, e.g. Follow up with account owner…"
                className="h-10 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-400"
              />
              <button
                type="submit"
                disabled={addingItem || !action.trim() || plan?.status === "done"}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="plus" size={15} />
                {addingItem ? "Adding…" : "Add step"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </DashboardLayout>
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-muted text-ink-faint">
        <Icon name="action" size={24} />
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