"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/Badge";

type StatCard = {
  label: string;
  value: string;
  hint?: string;
  icon: "users" | "check" | "lock" | "activity";
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch((err) => setError(err.message));
  }, []);

  const maxProvider = Math.max(1, ...(stats?.byProvider ?? []).map((p) => p.count));

  const cards: StatCard[] = [
    { label: "Total users", value: stats ? String(stats.total) : "—", icon: "users" },
    {
      label: "Email verified",
      value: stats ? String(stats.verified) : "—",
      icon: "check",
    },
    { label: "Blocked", value: stats ? String(stats.blocked) : "—", icon: "lock" },
    {
      label: "New last 7d",
      value: stats ? String(stats.signedUp.last7Days) : "—",
      hint: `${stats?.signedUp.last30Days ?? "—"} in 30d`,
      icon: "activity",
    },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-ink">
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Live snapshot of the RevOps user base.
          </p>
        </div>
        <span>
          <Badge tone="brand">Read model: revops DB</Badge>
        </span>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {card.label}
              </p>
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon name={card.icon} size={15} />
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-bold tracking-[-0.02em] text-ink">
              {card.value}
            </p>
            {card.hint ? (
              <p className="mt-0.5 text-[0.6875rem] text-ink-faint">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-bold text-ink">Sign up by provider</h2>
          <div className="mt-4 space-y-3">
            {stats?.byProvider.map((provider) => (
              <div key={provider.provider}>
                <div className="flex items-center justify-between text-[0.8125rem]">
                  <span className="font-medium capitalize text-ink-muted">
                    {provider.provider}
                  </span>
                  <span className="tabular font-semibold text-ink">
                    {provider.count}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-soft">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-500"
                    style={{
                      width: `${Math.max(3, (provider.count / maxProvider) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-bold text-ink">Verification status</h2>
          <div className="mt-4 space-y-2 text-[0.8125rem]">
            {[
              {
                label: "Email verified",
                value: stats?.verified ?? 0,
                className: "text-success-700",
              },
              {
                label: "Not verified",
                value: stats?.unverified ?? 0,
                className: "text-accent-600",
              },
              {
                label: "Blocked",
                value: stats?.blocked ?? 0,
                className: "text-danger-600",
              },
            ].map((row) => {
              const pct = stats?.total
                ? Math.round((row.value / stats.total) * 100)
                : 0;
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2"
                >
                  <span className="font-medium text-ink-muted">{row.label}</span>
                  <span className={cn("tabular font-bold", row.className)}>
                    {row.value}{" "}
                    <span className="font-medium text-ink-faint">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}