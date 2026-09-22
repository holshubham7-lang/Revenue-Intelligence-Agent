"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
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
  createdAt?: string;
  itemCount: number;
  doneItems: number;
};

const PLAN_STATUS: Record<Plan["status"], { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-surface-muted text-ink-muted" },
  open: { label: "Open", tone: "bg-brand-100 text-brand-700" },
  in_progress: { label: "In progress", tone: "bg-blue-100 text-blue-700" },
  done: { label: "Done", tone: "bg-brand-100 text-brand-700" },
  cancelled: { label: "Cancelled", tone: "bg-surface-muted text-ink-faint" },
};

const PRIORITY_TONE: Record<Plan["priority"], string> = {
  high: "text-danger-600",
  medium: "text-ink",
  low: "text-ink-muted",
};

export function ActionPlans() {
  const router = useRouter();

  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${API_URL}/action-plans`, {
          credentials: "include",
        });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          setError("Unable to load your action plans.");
          return;
        }
        const data = (await response.json()) as Plan[];
        setPlans(data);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, []);

  if (status !== "ready") {
    return (
      <DashboardLayout>
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
          <div className="mx-auto w-full max-w-5xl">
            {status === "loading" && <ActionPlansSkeleton />}
            {status === "unauthenticated" && (
              <InlineEmpty
                title="Sign in required"
                body="Sign in to manage your action plans."
                actionLabel="Go to dashboard"
                onAction={() => router.push("/dashboard")}
              />
            )}
            {status === "error" && (
              <InlineEmpty
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
              <Icon name="action" size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                Action Plans
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                Concrete next steps derived from your revenue findings. Track
                each one until it is applied.
              </p>
            </div>
          </div>

          {plans.length === 0 ? (
            <InlineEmpty
              title="No action plans yet"
              body="Open What Changed on a connected app and use “Create new action plan” to start one."
              actionLabel="Browse connected apps"
              onAction={() => router.push("/dashboard/connected-apps")}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {plans.map((plan) => {
                const meta = PLAN_STATUS[plan.status] ?? PLAN_STATUS.open;
                const progress =
                  plan.itemCount > 0
                    ? Math.round((plan.doneItems / plan.itemCount) * 100)
                    : 0;
                return (
                  <article
                    key={plan.id}
                    className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">
                          {plan.title}
                        </h3>
                        <p className="mt-1 text-xs capitalize text-ink-muted">
                          {plan.phase ?? plan.status}
                          {plan.createdAt
                            ? ` · ${formatRelativeScanTime(plan.createdAt)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
                            meta.tone,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span
                          className={cn(
                            "text-[0.6875rem] font-bold uppercase tracking-[0.08em]",
                            PRIORITY_TONE[plan.priority],
                          )}
                        >
                          {plan.priority}
                        </span>
                      </div>
                    </div>

                    {plan.summary ? (
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                        {plan.summary}
                      </p>
                    ) : null}

                    {plan.itemCount > 0 ? (
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
                          <span>
                            {plan.doneItems} of {plan.itemCount} steps done
                          </span>
                          <span className="font-semibold">{progress}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-brand-600 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <Link
                      href={`/dashboard/action-plans/${plan.id}`}
                      className="mt-4 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-xs font-semibold text-ink transition-colors hover:border-brand-300 hover:text-brand-700"
                    >
                      Open plan
                      <Icon name="arrow-right" size={14} />
                    </Link>
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

function ActionPlansSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading action plans">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-2xl border border-line bg-surface"
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