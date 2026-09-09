"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import type { AdminProfile } from "@/lib/types";
import { Icon } from "@/components/Icon";

type AuthState = "loading" | "authenticated" | "unauthenticated";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" as const, exact: true },
  { href: "/admin/users", label: "Users", icon: "users" as const, exact: false },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [state, setState] = useState<AuthState>("loading");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((profile) => {
        if (!active) return;
        setAdmin(profile);
        setState("authenticated");
      })
      .catch(() => {
        if (active) setState("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // cookie clear still attempted client-side
    }
    router.replace("/login");
  }

  if (state === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface-muted">
        <div className="flex flex-col items-center gap-3 text-ink-muted">
          <Icon name="spinner" size={24} className="animate-spin text-brand-600" />
          <p className="text-sm">Verifying admin session…</p>
        </div>
      </div>
    );
  }

  if (state === "unauthenticated") {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface-muted px-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
            <Icon name="shield" size={22} />
          </span>
          <h1 className="mt-4 text-base font-bold text-ink">Admin access required</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in with an admin account to open the panel.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink md:hidden"
          >
            <Icon name={sidebarOpen ? "close" : "menu"} size={20} />
          </button>
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Icon name="shield-check" size={18} />
          </span>
          <div className="leading-tight">
            <p className="text-[0.8125rem] font-bold tracking-[-0.01em] text-ink">
              {APP_NAME}
            </p>
            <p className="hidden text-[0.6875rem] text-ink-faint sm:block">
              Master Admin Panel
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 text-right leading-tight">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[0.8125rem] font-bold text-brand-700">
              {initials(admin?.name)}
            </span>
            <div className="min-w-0">
              <p className="max-w-[180px] truncate text-[0.8125rem] font-semibold text-ink">
                {admin?.name}
                <span className="ml-1.5 rounded bg-brand-50 px-1 py-px text-[0.625rem] font-bold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
                  Admin
                </span>
              </p>
              <p className="mono max-w-[180px] truncate text-[0.6875rem] text-ink-faint">
                {admin?.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8125rem] font-semibold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <Icon name="logout" size={15} />
            <span>
              Sign out
            </span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-ink/40 md:hidden"
          />
        ) : null}

        <aside
          className={cn(
            "fixed bottom-0 left-0 top-14 z-30 flex w-56 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 md:static md:top-auto md:translate-x-0 md:transition-none",
            sidebarOpen
              ? "translate-x-0 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
              : "-translate-x-full",
          )}
        >
          <nav className="flex flex-col gap-1 p-3">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-muted hover:bg-surface-soft hover:text-ink",
                  )}
                >
                  <Icon
                    name={item.icon}
                    size={17}
                    className={active ? "text-brand-600" : "text-ink-faint"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-line bg-surface px-4 py-3 text-center text-[0.6875rem] text-ink-faint md:px-6">
        Copyright © {new Date().getFullYear()} StratVeda Technologies | All
        rights reserved.
      </footer>
    </div>
  );
}

function initials(name?: string): string {
  const parts = (name ?? "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}