"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheck, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ErrorToastHost } from "@/components/ui/Toast";
import { forgotPassword } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Password reset request on `/forgot-password`.
 *
 * Collects the work email, POSTs to the `/api/auth/forgot-password` seam, and
 * swaps to a neutral confirmation panel once a request has been made. The
 * message never leaks whether the address exists.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const copy = forgotPassword.form;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || sent) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("request_failed");
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setFormError(offline ? copy.errors.network : copy.errors.server);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setSent(true);
  }

  const fieldClass = cn(
    "h-12 w-full rounded-control border border-line bg-bg-elevated px-4 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
    "placeholder:text-ink-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25",
  );

  return (
    <div className="relative w-full max-w-[26rem]">
      {/* Error toast — centred over the card */}
      <ErrorToastHost error={formError} onDismiss={() => setFormError(null)} />

      <div className="rounded-card border border-line bg-bg-elevated p-7 shadow-inner sm:p-8">
      <span className="inline-flex size-12 items-center justify-center rounded-tile bg-brand-soft text-brand">
        {sent ? (
          <CircleCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <KeyRound className="size-6" strokeWidth={1.75} aria-hidden="true" />
        )}
      </span>

      {sent ? (
        <>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            {copy.success.title}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            {copy.success.message}
          </p>
          <p className="mt-6 border-t border-line pt-6 text-center text-sm text-ink-muted">
            {copy.footer.prompt}{" "}
            <Link
              href={copy.footer.linkHref}
              className="rounded-sm font-semibold text-brand transition-colors duration-200 ease-out hover:text-brand-hover"
            >
              {copy.footer.linkLabel}
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
            {copy.title}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            {copy.subtitle}
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">
                {copy.email.label}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={copy.email.placeholder}
                className={fieldClass}
              />
              <p id="email-hint" className="mt-1.5 text-sm text-ink-subtle">
                {copy.email.hint}
              </p>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {copy.submitting}
                </>
              ) : (
                copy.submit
              )}
            </Button>
          </form>

          <p className="mt-6 border-t border-line pt-6 text-center text-sm text-ink-muted">
            {copy.footer.prompt}{" "}
            <Link
              href={copy.footer.linkHref}
              className="rounded-sm font-semibold text-brand transition-colors duration-200 ease-out hover:text-brand-hover"
            >
              {copy.footer.linkLabel}
            </Link>
          </p>
        </>
      )}
      </div>
    </div>
  );
}