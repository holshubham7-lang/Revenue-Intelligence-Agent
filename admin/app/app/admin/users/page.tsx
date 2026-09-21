"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { AdminUser, UserSortField } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Badge, ProviderBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const PAGE_SIZE = 15;

const DEFAULT_QUERY = {
  search: "",
  provider: "",
  emailVerified: "",
  blocked: "",
  includeTest: false,
};

type Query = {
  search: string;
  provider: string;
  emailVerified: string;
  blocked: string;
  includeTest: boolean;
};

interface Filters extends Query {
  sortBy: UserSortField;
  sortDir: "asc" | "desc";
  page: number;
}

function SortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: UserSortField;
  sortBy: UserSortField;
  sortDir: "asc" | "desc";
  onSort: (field: UserSortField) => void;
}) {
  const active = sortBy === field;
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1",
          sortBy === field
            ? "text-brand-600"
            : "text-ink-faint hover:text-ink",
          "text-[0.6875rem] font-semibold uppercase tracking-[0.08em]",
        )}
      >
        {label}
        <Icon
          name={active && sortDir === "desc" ? "chevron-down" : "chevron-up"}
          size={12}
          className={active ? "opacity-100" : "opacity-0"}
        />
      </button>
    </th>
  );
}

function AvatarCell({ user }: { user: AdminUser }) {
  if (user.profileImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.profileImage}
        alt={`${user.name} avatar`}
        className="h-9 w-9 rounded-full border border-line bg-surface-soft object-cover"
      />
    );
  }
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-soft text-[0.75rem] font-semibold text-ink-muted">
      {initial}
    </span>
  );
}

function UserCell({ user }: { user: AdminUser }) {
  return (
    <Link href={`/admin/users/${user.id}`} className="block">
      <p className="flex flex-wrap items-center gap-1.5 text-[0.875rem] font-semibold text-ink hover:text-brand-700">
        {user.name}
        {user.isAdmin ? <Badge tone="brand">Admin</Badge> : null}
        {user.isTestAccount ? <Badge tone="warn">Test</Badge> : null}
        {!user.nameDecrypted ? (
          <span className="mono text-[0.6875rem] text-accent-600">
            (encrypted)
          </span>
        ) : null}
      </p>
      <p className="mono mt-0.5 text-[0.75rem] text-ink-muted">{user.email}</p>
    </Link>
  );
}

function StatusCell({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.isEmailVerified ? (
        <Badge tone="success">
          <Icon name="check" size={11} /> Verified
        </Badge>
      ) : (
        <Badge tone="warn" className="whitespace-nowrap">
          Not verified
        </Badge>
      )}
      {user.isBlocked ? (
        <Badge tone="danger">
          <Icon name="lock" size={11} /> Blocked
        </Badge>
      ) : null}
    </div>
  );
}

export default function UsersPage() {
  const [draft, setDraft] = useState<Query>({ ...DEFAULT_QUERY });
  const [filters, setFilters] = useState<Filters>({
    ...DEFAULT_QUERY,
    sortBy: "createdAt",
    sortDir: "desc",
    page: 1,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listUsers({
        search: filters.search || undefined,
        provider: filters.provider || undefined,
        emailVerified: filters.emailVerified || undefined,
        blocked: filters.blocked || undefined,
        includeTest: filters.includeTest || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        page: filters.page,
        limit: PAGE_SIZE,
      })
      .then((data) => {
        if (!active) return;
        setUsers(data.items);
        setTotal(data.total);
        setPages(Math.max(1, data.pages));
        setError(null);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  function updateDraft<K extends keyof Query>(key: K, value: Query[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function apply() {
    setLoading(true);
    setFilters((prev) => ({ ...prev, ...draft, page: 1 }));
  }

  function clear() {
    setDraft({ ...DEFAULT_QUERY });
    setLoading(true);
    setFilters((prev) => ({ ...prev, ...DEFAULT_QUERY, page: 1 }));
  }

  function sortBy(field: UserSortField) {
    setLoading(true);
    setFilters((prev) =>
      prev.sortBy === field
        ? { ...prev, sortDir: prev.sortDir === "desc" ? "asc" : "desc" }
        : { ...prev, sortBy: field, sortDir: "asc" },
    );
  }

  function changePage(page: number) {
    setLoading(true);
    setFilters((prev) => ({ ...prev, page }));
  }

  const dirty =
    draft.search !== filters.search ||
    draft.provider !== filters.provider ||
    draft.emailVerified !== filters.emailVerified ||
    draft.blocked !== filters.blocked ||
    draft.includeTest !== filters.includeTest;

  const hasActiveFilters = !!(
    filters.search ||
    filters.provider ||
    filters.emailVerified ||
    filters.blocked ||
    filters.includeTest
  );

  const selectCls =
    "h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.8125rem] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Directory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-ink">
            Users
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Real user accounts by default; test and admin accounts are hidden.
          </p>
        </div>
        <p className="tabular text-sm text-ink-faint">{total} total</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint">
            <Icon name="search" size={16} />
          </span>
          <input
            value={draft.search}
            onChange={(e) => updateDraft("search", e.target.value)}
            placeholder="Search name or email…"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <select
          value={draft.provider}
          onChange={(e) => updateDraft("provider", e.target.value)}
          className={selectCls}
          aria-label="Filter by provider"
        >
          <option value="">All providers</option>
          <option value="email">Email</option>
          <option value="google">Google</option>
          <option value="microsoft">Microsoft</option>
          <option value="linkedin">LinkedIn</option>
        </select>

        <select
          value={draft.emailVerified}
          onChange={(e) => updateDraft("emailVerified", e.target.value)}
          className={selectCls}
          aria-label="Filter by email verification"
        >
          <option value="">Any verification</option>
          <option value="true">Email verified</option>
          <option value="false">Not verified</option>
        </select>

        <select
          value={draft.blocked}
          onChange={(e) => updateDraft("blocked", e.target.value)}
          className={selectCls}
          aria-label="Filter by block status"
        >
          <option value="">Any status</option>
          <option value="true">Blocked</option>
          <option value="false">Not blocked</option>
        </select>

        <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] font-semibold text-ink-muted">
          <input
            type="checkbox"
            checked={draft.includeTest}
            onChange={(e) => updateDraft("includeTest", e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Include tests &amp; admins
        </label>

        <Button
          variant="primary"
          className="h-9"
          disabled={!dirty || loading}
          onClick={apply}
        >
          Apply
          <Icon name="check" size={15} />
        </Button>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold text-ink-muted hover:text-ink"
          >
            <Icon name="close" size={14} />
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      ) : null}

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-muted">
                <SortHeader label="User" field="name" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={sortBy} />
                <th className="px-4 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Image
                </th>
                <SortHeader label="Provider" field="authProvider" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={sortBy} />
                <th className="px-4 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Status
                </th>
                <SortHeader label="Signed up" field="createdAt" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={sortBy} />
                <th className="px-4 py-2.5 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="h-3.5 w-40 animate-pulse rounded bg-surface-soft" />
                        <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-surface-soft" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-9 w-9 animate-pulse rounded-full bg-surface-soft" />
                      </td>
                      {[0, 1, 2].map((c) => (
                        <td key={c} className="px-4 py-3">
                          <div className="h-3.5 w-16 animate-pulse rounded bg-surface-soft" />
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="ml-auto h-3.5 w-12 animate-pulse rounded bg-surface-soft" />
                      </td>
                    </tr>
                  ))
                : users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-surface-muted/60"
                    >
                      <td className="px-4 py-3">
                        <UserCell user={user} />
                      </td>
                      <td className="px-4 py-3">
                        <AvatarCell user={user} />
                      </td>
                      <td className="px-4 py-3">
                        <ProviderBadge provider={user.authProvider} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusCell user={user} />
                      </td>
                      <td className="tabular px-4 py-3 text-[0.75rem] text-ink-muted">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.8125rem] font-semibold text-ink shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                        >
                          View
                          <Icon name="arrow-right" size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Icon name="users" size={28} className="mx-auto text-ink-faint" />
                    <p className="mt-2 text-sm font-medium text-ink-muted">
                      No users match these filters.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <p className="tabular text-[0.75rem] text-ink-faint">
              Page {filters.page} of {pages} · showing{" "}
              {users.length ? (filters.page - 1) * PAGE_SIZE + 1 : 0}–
              {(filters.page - 1) * PAGE_SIZE + users.length}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={filters.page <= 1 || loading}
                onClick={() => changePage(filters.page - 1)}
              >
                <Icon name="chevron-left" size={15} />
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={filters.page >= pages || loading}
                onClick={() => changePage(filters.page + 1)}
              >
                Next
                <Icon name="chevron-right" size={15} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}