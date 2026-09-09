"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.login(email.trim(), password);
      router.replace("/admin");
    } catch (err) {
      toast({
        title: "Sign in failed",
        description:
          err instanceof ApiError ? err.message : "Could not reach the admin API.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Icon name="shield-check" size={26} />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-[-0.02em] text-ink">
            StratVeda Admin
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Master Admin Panel — restricted access.
          </p>
        </div>

        <form onSubmit={submit} className="card p-6">
          <label htmlFor="email" className="text-[0.8125rem] font-semibold text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com"
            className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.875rem] text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />

          <label htmlFor="password" className="mt-4 block text-[0.8125rem] font-semibold text-ink">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.875rem] text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />

          <Button
            type="submit"
            disabled={busy || !email || !password}
            className="mt-5 w-full"
          >
            {busy ? (
              <Icon name="spinner" size={16} className="animate-spin" />
            ) : null}
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-[0.6875rem] text-ink-faint">
          Only accounts listed in ADMIN_EMAILS can access this panel.
        </p>
      </div>
    </div>
  );
}