"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DashboardFooter } from "@/components/dashboard/DashboardFooter";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { API_URL } from "@/lib/constants";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId?: string;
  hasCompany?: boolean;
  authProvider?: "email" | "google" | "microsoft" | "linkedin";
  isEmailVerified?: boolean;
  createdAt?: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email & password",
  google: "Google",
  microsoft: "Microsoft",
  linkedin: "LinkedIn",
};

const inputBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

function initalsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${date.getFullYear()}`;
}

export function AccountSettings() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "unauthenticated" | "error"
  >("loading");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (response.status === 401) {
          setStatus("unauthenticated");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          setError("Unable to load your account.");
          return;
        }
        const data = (await response.json()) as SessionUser;
        setUser(data);
        setName(data.name);
        setStatus("ready");
      } catch {
        setStatus("error");
        setError("Network error. Please try again.");
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    if (window.location.hash === "#change-password") {
      const el = document.getElementById("change-password");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  async function handleSaveName(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        title: "Check your details",
        description: "Full name is required",
        variant: "error",
      });
      return;
    }
    setSavingName(true);
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          (body as { message?: string | string[] } | null)?.message ??
          "Something went wrong.";
        toast({
          title: "Couldn’t update your profile",
          description: Array.isArray(message) ? message.join(" ") : message,
          variant: "error",
        });
        return;
      }
      const updated = (await response.json()) as SessionUser;
      setUser(updated);
      setName(updated.name);
      toast({
        title: "Profile updated",
        description: "Your name has been saved.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Network error",
        description: "Cannot reach the service. Please try again.",
        variant: "error",
      });
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPassword) {
      toast({
        title: "Check your details",
        description: "Current password is required",
        variant: "error",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Check your details",
        description: "New password must be at least 8 characters",
        variant: "error",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don’t match",
        description: "Your new password and confirmation must match.",
        variant: "error",
      });
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch(`${API_URL}/auth/me/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          (body as { message?: string | string[] } | null)?.message ??
          "Something went wrong.";
        toast({
          title: "Couldn’t change your password",
          description: Array.isArray(message) ? message.join(" ") : message,
          variant: "error",
        });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password changed",
        description: "Your password has been updated.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Network error",
        description: "Cannot reach the service. Please try again.",
        variant: "error",
      });
    } finally {
      setSavingPassword(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-dvh flex-col bg-surface">
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Icon
              name="spark"
              size={28}
              className="animate-pulse-soft text-brand-600"
            />
            <p className="text-sm text-ink-muted">Loading your account…</p>
          </div>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="flex min-h-dvh flex-col bg-surface">
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
            <Icon name="lock" size={26} className="mx-auto text-brand-600" />
            <h1 className="mt-3 text-base font-semibold text-ink">
              Unable to verify your session
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Please sign in to access account settings.
            </p>
            <Button
              href="/sign-in"
              variant="primary"
              size="md"
              className="mt-5 w-full"
            >
              Go to sign in
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (status === "error" || !user) {
    return (
      <main className="flex min-h-dvh flex-col bg-surface">
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="rounded-2xl border border-danger-300 bg-danger-50 px-4 py-6 text-center">
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  const canChangePassword = user.authProvider === "email";

  return (
    <main className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-line px-6 py-4 md:px-10">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-brand-500 hover:text-brand-700"
            aria-label="Back to dashboard"
          >
            <Icon name="arrow-left" size={18} />
          </button>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-[-0.01em] text-ink">
              Account settings
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
              <Icon name="user" size={24} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                Manage your account
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                Update your name, change your password, and review your account
                details.
              </p>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="border-b border-line bg-surface-muted px-5 py-3.5">
              <p className="text-sm font-bold tracking-[-0.01em] text-ink">
                Profile
              </p>
            </div>
            <form onSubmit={handleSaveName} className="p-5" noValidate>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">
                  Full name <span className="text-danger-400">*</span>
                </span>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Jane Cooper"
                  className={inputBase}
                />
              </label>
              <div className="mt-5 flex items-center justify-end gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={savingName}
                  className="h-10 px-5 text-sm"
                >
                  <Icon name="check" size={16} />
                  {savingName ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </form>
          </section>

          {canChangePassword ? (
            <section
              id="change-password"
              className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <div className="border-b border-line bg-surface-muted px-5 py-3.5">
                <p className="text-sm font-bold tracking-[-0.01em] text-ink">
                  Change password
                </p>
              </div>
              <form
                onSubmit={handleChangePassword}
                className="space-y-5 p-5"
                noValidate
              >
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">
                    Current password{" "}
                    <span className="text-danger-400">*</span>
                  </span>
                  <input
                    required
                    type="password"
                    value={currentPassword}
                    onChange={(event) =>
                      setCurrentPassword(event.target.value)
                    }
                    placeholder="Enter your current password"
                    className={inputBase}
                    autoComplete="current-password"
                  />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">
                      New password{" "}
                      <span className="text-danger-400">*</span>
                    </span>
                    <input
                      required
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Min. 8 characters, letters & numbers"
                      className={inputBase}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">
                      Confirm new password{" "}
                      <span className="text-danger-400">*</span>
                    </span>
                    <input
                      required
                      type="password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Repeat your new password"
                      className={inputBase}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={savingPassword}
                    className="h-10 px-5 text-sm"
                  >
                    <Icon name="lock" size={16} />
                    {savingPassword ? "Updating…" : "Update password"}
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="border-b border-line bg-surface-muted px-5 py-3.5">
              <p className="text-sm font-bold tracking-[-0.01em] text-ink">
                Account details
              </p>
            </div>
            <div className="flex items-center gap-4 px-5 py-5">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-700 ring-1 ring-brand-200/70">
                {initalsOf(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold text-ink">
                  {user.name}
                </p>
                <p className="truncate text-sm text-ink-muted">
                  {user.email}
                </p>
              </div>
            </div>
            <table className="w-full border-t border-line text-left text-sm">
              <tbody>
                {[
                  {
                    label: "Sign-in method",
                    value: PROVIDER_LABELS[user.authProvider ?? "email"],
                  },
                  {
                    label: "Email verified",
                    value:
                      user.isEmailVerified === true ? "Yes" : "Not yet",
                  },
                  {
                    label: "Member since",
                    value: formatDate(user.createdAt),
                  },
                ].map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-line last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="w-56 px-5 py-3.5 align-top text-[0.8125rem] font-semibold text-ink-muted"
                    >
                      {row.label}
                    </th>
                    <td className="px-5 py-3.5 align-top text-[0.9375rem] text-ink">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <DashboardFooter />
    </main>
  );
}