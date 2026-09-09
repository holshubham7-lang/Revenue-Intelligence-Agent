"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { AdminUser, UserActivityClient } from "@/lib/types";
import { formatDate, timeAgo } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Badge, ProviderBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

type ActionState = "idle" | "busy";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [activity, setActivity] = useState<UserActivityClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>("idle");
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.getUser(id), api.activity(id)])
      .then(([u, a]) => {
        if (!active) return;
        setUser(u);
        setActivity(a);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function run(
    patch: Parameters<typeof api.updateUser>[1],
    flash: string,
    refresh = true,
  ) {
    setAction("busy");
    try {
      const updated = await api.updateUser(id, patch);
      if (refresh) setUser(updated);
      toast({ title: flash, variant: "success" });
    } catch (err) {
      toast({
        title: "Action failed",
        description: (err as Error).message,
        variant: "error",
      });
    } finally {
      setAction("idle");
      setShowReset(false);
      setNewPassword("");
    }
  }

  async function handleDelete() {
    setAction("busy");
    try {
      await api.deleteUser(id);
      toast({ title: "Account deleted", variant: "success" });
      router.replace("/admin/users");
    } catch (err) {
      toast({
        title: "Delete failed",
        description: (err as Error).message,
        variant: "error",
      });
      setAction("idle");
    }
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 lg:p-8">
        <div className="h-5 w-52 animate-pulse rounded bg-surface-soft" />
        <div className="card mt-4 h-40 animate-pulse rounded-xl bg-surface-soft" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/admin/users")}
        className="mb-4 -ml-2"
      >
        <Icon name="arrow-left" size={15} />
        Back to users
      </Button>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
                {(user.name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                  {user.name}
                  {!user.nameDecrypted ? (
                    <span className="mono ml-2 text-[0.6875rem] font-normal text-accent-600">
                      (encrypted name)
                    </span>
                  ) : null}
                </h1>
                <p className="mono text-[0.8125rem] text-ink-muted">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {user.isAdmin ? <Badge tone="brand">Admin</Badge> : null}
              {user.isTestAccount ? <Badge tone="warn">Test account</Badge> : null}
              {user.isEmailVerified ? (
                <Badge tone="success">Email verified</Badge>
              ) : (
                <Badge tone="warn">Email not verified</Badge>
              )}
              {user.isBlocked ? <Badge tone="danger">Blocked</Badge> : <Badge tone="neutral">Active</Badge>}
              <ProviderBadge provider={user.authProvider} />
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
            {[
              { label: "User ID", value: user.id, mono: true },
              { label: "Provider ID", value: user.providerId ?? "—", mono: true },
              { label: "Company ID", value: user.companyId ?? "—", mono: true },
              { label: "Signed up", value: formatDate(user.createdAt) },
              { label: "Last updated", value: formatDate(user.updatedAt) },
              { label: "Profile image", value: user.profileImage ? "Yes" : "—" },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  {row.label}
                </dt>
                <dd
                  className={
                    row.mono
                      ? "mono mt-0.5 break-all text-[0.8125rem] text-ink"
                      : "mt-0.5 text-[0.8125rem] text-ink"
                  }
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            {user.isEmailVerified ? (
              <Button variant="secondary" size="sm" disabled={action === "busy"} onClick={() => run({ isEmailVerified: false }, "Marked email as unverified.")}>
                Mark email unverified
              </Button>
            ) : (
              <Button variant="primary" size="sm" disabled={action === "busy"} onClick={() => run({ isEmailVerified: true }, "Email verified.")}>
                <Icon name="check" size={15} />
                Verify email
              </Button>
            )}

            {user.isBlocked ? (
              <Button variant="secondary" size="sm" disabled={action === "busy"} onClick={() => run({ isBlocked: false }, "Account unblocked. Sessions restored for next sign-in.")}>
                <Icon name="shield-check" size={15} />
                Unblock account
              </Button>
            ) : (
              <Button variant="warning" size="sm" disabled={action === "busy"} onClick={() => run({ isBlocked: true }, "Account blocked. All sessions revoked.")}>
                <Icon name="lock" size={15} />
                Block account
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              disabled={action === "busy"}
              onClick={() => setShowReset((v) => !v)}
            >
              <Icon name="autorenew" size={15} />
              Reset password
            </Button>

            <Button
              variant="danger"
              size="sm"
              disabled={action === "busy"}
              onClick={() => setConfirmDelete((v) => !v)}
            >
              <Icon name="trash" size={15} />
              Delete account
            </Button>
          </div>

          {showReset ? (
            <form
              className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                run({ newPassword }, "Password reset. User sessions revoked.");
              }}
            >
              <label htmlFor="new-password" className="text-[0.8125rem] font-semibold text-brand-800">
                New password (min. 8 characters)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="new-password"
                  type="password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-brand-300 bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <Button type="submit" size="sm" disabled={action === "busy" || newPassword.length < 8}>
                  Save new password
                </Button>
              </div>
            </form>
          ) : null}

          {confirmDelete ? (
            <div className="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-4">
              <p className="text-sm font-semibold text-danger-700">
                Delete this account permanently?
              </p>
              <p className="mt-1 text-[0.8125rem] text-danger-700/80">
                The user, their sessions and activity records will be removed. This cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" disabled={action === "busy"} onClick={handleDelete}>
                  <Icon name="trash" size={15} />
                  Delete permanently
                </Button>
                <Button variant="secondary" size="sm" disabled={action === "busy"} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card h-fit p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Activity log</h2>
            <span className="mono text-[0.6875rem] text-ink-faint">{activity?.total ?? "—"}</span>
          </div>
          <div className="mt-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
            {activity?.items.length ? (
              activity.items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-300" />
                  <div className="min-w-0">
                    <p className="mono break-words text-[0.78125rem] font-medium text-ink">
                      {item.event}
                    </p>
                    <p className="tabular text-[0.6875rem] text-ink-faint">
                      {timeAgo(item.createdAt)} · {formatDate(item.createdAt)}
                    </p>
                    {item.ip ? (
                      <p className="mono text-[0.6875rem] text-ink-faint">{item.ip}</p>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-faint">No activity recorded.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}