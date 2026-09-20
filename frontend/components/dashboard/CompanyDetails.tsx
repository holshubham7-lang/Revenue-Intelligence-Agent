"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DashboardFooter } from "@/components/dashboard/DashboardFooter";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import {
  API_URL,
  APP_URL,
  COMPANY_SIZE_OPTIONS,
  REVENUE_RANGE_OPTIONS,
} from "@/lib/constants";

type Company = {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  revenueRange?: string;
  problemStatement?: string;
  createdAt?: string;
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId?: string;
  hasCompany?: boolean;
};

type Row = { label: string; value?: string; href?: string };

export function CompanyDetails() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    website: "",
    industry: "",
    companySize: "",
    country: "",
    revenueRange: "",
    problemStatement: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const meRes = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!meRes.ok) {
          if (!cancelled) {
            setStatus("error");
            setError("You’re not signed in.");
          }
          return;
        }
        const me = (await meRes.json()) as SessionUser;
        if (cancelled) return;
        setUser(me);

        if (!me.hasCompany && !me.companyId) {
          setStatus("empty");
          return;
        }

        const compRes = await fetch(`${API_URL}/companies/me`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (compRes.ok) {
          setCompany((await compRes.json()) as Company);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Network error. Please try again.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // proceed to redirect regardless
    }
    window.location.assign(APP_URL);
  }

  function startEditing() {
    if (!company) return;
    setForm({
      name: company.name ?? "",
      website: company.website ?? "",
      industry: company.industry ?? "",
      companySize: company.companySize ?? "",
      country: company.country ?? "",
      revenueRange: company.revenueRange ?? "",
      problemStatement: company.problemStatement ?? "",
    });
    setEditing(true);
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();

    const required = [
      { key: "name", label: "Company name" },
      { key: "industry", label: "Industry" },
      { key: "companySize", label: "Company size" },
      { key: "country", label: "Country" },
      { key: "revenueRange", label: "Revenue range" },
    ] as const;

    const missing = required.find((field) => !form[field.key].trim());
    if (missing) {
      toast({
        title: "Check your details",
        description: `${missing.label} is required`,
        variant: "error",
      });
      return;
    }

    if (countWords(form.problemStatement) > MAX_PROBLEM_WORDS) {
      toast({
        title: "Problem description is too long",
        description: `Please keep it to ${MAX_PROBLEM_WORDS} words or fewer.`,
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/companies/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          website: form.website.trim() || undefined,
          industry: form.industry.trim(),
          companySize: form.companySize,
          country: form.country.trim(),
          revenueRange: form.revenueRange,
          problemStatement: form.problemStatement.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          (body as { message?: string | string[] } | null)?.message ??
          "Something went wrong. Please try again.";
        toast({
          title: "Couldn’t save changes",
          description: Array.isArray(message) ? message.join(" ") : message,
          variant: "error",
        });
        return;
      }
      const updated = (await response.json()) as Company;
      setCompany(updated);
      setEditing(false);
      toast({
        title: "Company updated",
        description: "Your company details were saved.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Network error",
        description:
          "Cannot reach the service. Check your connection and try again.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  const inputBase =
    "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  const MAX_PROBLEM_WORDS = 1500;

  function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  const rows: Row[] = [
    { label: "Company name", value: company?.name },
    { label: "Website", value: company?.website, href: company?.website },
    { label: "Industry", value: company?.industry },
    { label: "Company size", value: company?.companySize },
    { label: "Country", value: company?.country },
    { label: "Annual revenue range", value: company?.revenueRange },
    {
      label: "Problem / query",
      value: company?.problemStatement,
    },
    {
      label: "Created",
      value: company?.createdAt
        ? (() => {
            const date = new Date(company.createdAt);
            const d = String(date.getDate()).padStart(2, "0");
            const m = String(date.getMonth() + 1).padStart(2, "0");
            const y = date.getFullYear();
            return `${d}-${m}-${y}`;
          })()
        : undefined,
    },
  ];

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
              Company details
            </p>
            <p className="text-[0.6875rem] font-medium text-ink-faint">
              {user?.email ?? "Your workspace"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={handleLogout}
          disabled={loggingOut}
          className="shrink-0"
        >
          <Icon name="logout" size={16} />
          {loggingOut ? "Logging out…" : "Log out"}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
              <Icon name="building" size={24} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                Saved company details
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                The company information you provided during setup, stored in
                your workspace.
              </p>
            </div>
          </div>

          {status === "loading" ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-muted py-16 text-center">
              <Icon
                name="spark"
                size={24}
                className="animate-pulse-soft text-brand-600"
              />
              <p className="text-sm text-ink-muted">Loading company details…</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="rounded-2xl border border-danger-300 bg-danger-50 px-4 py-6 text-center">
              <p className="text-sm text-danger-700">{error}</p>
            </div>
          ) : null}

          {status === "empty" ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface-muted py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
                <Icon name="building" size={22} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No company saved yet
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Set up your company to see its details here.
                </p>
              </div>
              <Button
                href="/dashboard"
                variant="primary"
                size="md"
                className="mt-2"
              >
                Go to dashboard
              </Button>
            </div>
          ) : null}

          {status === "ready" && company ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line bg-surface-muted px-5 py-3.5">
                <p className="text-sm font-bold tracking-[-0.01em] text-ink">
                  {company.name}
                </p>
                {!editing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={startEditing}
                    className="h-9 px-3 text-xs"
                  >
                    <Icon name="edit" size={15} />
                    Edit
                  </Button>
                ) : null}
              </div>

              {editing ? (
                <form
                  id="company-edit-form"
                  onSubmit={handleSave}
                  noValidate
                  className="space-y-5 border-b border-line p-5"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Company name <span className="text-danger-400">*</span>
                      </span>
                      <input
                        autoFocus
                        required
                        type="text"
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="e.g. Acme SaaS Inc."
                        className={inputBase}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Website{" "}
                        <span className="text-ink-faint">(optional)</span>
                      </span>
                      <input
                        type="text"
                        value={form.website}
                        onChange={(e) =>
                          updateField("website", e.target.value)
                        }
                        placeholder="https://acme.com"
                        className={inputBase}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Industry <span className="text-danger-400">*</span>
                      </span>
                      <input
                        required
                        type="text"
                        value={form.industry}
                        onChange={(e) =>
                          updateField("industry", e.target.value)
                        }
                        placeholder="e.g. SaaS, Fintech, E-commerce"
                        className={inputBase}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Company size <span className="text-danger-400">*</span>
                      </span>
                      <select
                        value={form.companySize}
                        onChange={(e) =>
                          updateField("companySize", e.target.value)
                        }
                        className={inputBase}
                      >
                        <option value="">Select size…</option>
                        {COMPANY_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Country <span className="text-danger-400">*</span>
                      </span>
                      <input
                        required
                        type="text"
                        value={form.country}
                        onChange={(e) =>
                          updateField("country", e.target.value)
                        }
                        placeholder="e.g. United States"
                        className={inputBase}
                      />
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Annual revenue range{" "}
                        <span className="text-danger-400">*</span>
                      </span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {REVENUE_RANGE_OPTIONS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() =>
                              updateField("revenueRange", option)
                            }
                            className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                              form.revenueRange === option
                                ? "border-brand-500 bg-brand-50 text-brand-800"
                                : "border-line-strong bg-surface text-ink-muted hover:border-brand-400 hover:text-brand-700"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">
                        Problem description / query{" "}
                        <span className="text-ink-faint">
                          (optional · max 1500 words)
                        </span>
                      </span>
                      <textarea
                        value={form.problemStatement}
                        onChange={(event) =>
                          updateField("problemStatement", event.target.value)
                        }
                        rows={5}
                        placeholder="Describe the problem or the question you want the StratVeda Revenue Intelligence Agent to help fix — e.g. 'We lose deals in the middle of our sales cycle but can't tell why.'"
                        className={`${inputBase} resize-y`}
                        aria-label="Problem description or query for the Revenue Intelligence Agent"
                      />
                      <span
                        className={`mt-1.5 block text-right text-[0.6875rem] ${
                          countWords(form.problemStatement) > MAX_PROBLEM_WORDS
                            ? "font-semibold text-danger-600"
                            : "text-ink-faint"
                        }`}
                      >
                        {countWords(form.problemStatement).toLocaleString()} /{" "}
                        {MAX_PROBLEM_WORDS.toLocaleString()} words
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                      className="h-10 px-4 text-sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={saving}
                      className="h-10 px-5 text-sm"
                    >
                      <Icon name="check" size={16} />
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              ) : null}

              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {rows
                    .filter((row) => row.value)
                    .map((row) => (
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
                        <td className="max-w-72 px-5 py-3.5 align-top text-[0.9375rem] text-ink">
                          {row.href ? (
                            <a
                              href={row.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={row.value}
                              className="block truncate text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
                            >
                              {row.value}
                            </a>
                          ) : (
                            <span
                              title={row.value}
                              className="block truncate"
                            >
                              {row.value}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <DashboardFooter />
    </main>
  );
}
