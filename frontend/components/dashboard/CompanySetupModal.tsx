"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { API_URL, COMPANY_SIZE_OPTIONS, REVENUE_RANGE_OPTIONS } from "@/lib/constants";

type CompanySetupModalProps = {
  userName: string;
  onComplete: () => void;
  onLogout: () => void;
};

export function CompanySetupModal({
  userName,
  onComplete,
  onLogout,
}: CompanySetupModalProps) {
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
  const [submitting, setSubmitting] = useState(false);

  const MAX_PROBLEM_WORDS = 1500;

  function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
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

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/companies`, {
        method: "POST",
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
          title: "Company setup failed",
          description: Array.isArray(message) ? message.join(" ") : message,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Company created",
        description: "Your workspace is ready. Setting up your dashboard…",
        variant: "success",
      });
      onComplete();
    } catch {
      toast({
        title: "Network error",
        description: "Cannot reach the service. Check your connection and try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-line px-6 py-4 md:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Icon name="spark" size={20} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-[-0.01em] text-ink">
              Set up your company
            </p>
            <p className="text-[0.6875rem] font-medium text-ink-faint">
              Welcome, {userName} — let&apos;s get your workspace configured
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={onLogout}
          className="shrink-0"
        >
          <Icon name="logout" size={16} />
          Log out
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <form
          id="company-setup-form"
          onSubmit={handleSubmit}
          noValidate
          className="mx-auto w-full max-w-2xl"
        >
          <div className="mb-8 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
              <Icon name="building" size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                Tell us about your company
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                This information helps the Revenue Intelligence Agent understand your business
                context to surface accurate revenue insights. It&apos;s required
                before you can use the agent.
              </p>
            </div>
          </div>

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
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g. Acme SaaS Inc."
                className={inputBase}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Website <span className="text-ink-faint">(optional)</span>
              </span>
              <input
                type="text"
                value={form.website}
                onChange={(event) => updateField("website", event.target.value)}
                placeholder="https://acme.com"
                className={inputBase}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Industry <span className="text-danger-400">*</span>
              </span>
              <input
                type="text"
                value={form.industry}
                onChange={(event) => updateField("industry", event.target.value)}
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
                onChange={(event) =>
                  updateField("companySize", event.target.value)
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
                type="text"
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                placeholder="e.g. United States"
                className={inputBase}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Annual revenue range <span className="text-danger-400">*</span>
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                {REVENUE_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateField("revenueRange", option)}
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

          <div className="mt-8 flex items-center justify-end gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              className="min-w-44"
            >
              {submitting ? "Saving…" : "Create company & continue"}
            </Button>
          </div>
        </form>
      </div>

      <div className="border-t border-line px-6 py-4 md:px-10">
        <p className="text-center text-[0.6875rem] text-ink-faint">
          You&apos;ll be able to fully interact with the Revenue Intelligence Agent after your
          company is set up. This step can&apos;t be skipped.
        </p>
      </div>
    </div>
  );
}
