"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheck, Eye, EyeOff, Loader2 } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { SocialButtons, type ProviderKey } from "@/components/signup/SocialButtons";
import { postJson } from "@/lib/api/csrf-client";
import { startOAuth } from "@/lib/auth/oauth-client";
import { signup, toasts } from "@/lib/content";
import { cn } from "@/lib/utils";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<ProviderKey | null>(null);

  const { toast } = useToast();

  const { terms } = signup.form;
  const termsLinks = terms.links.flatMap((link, i) => [
    <Link
      key={`link-${link.href}`}
      href={link.href}
      className="rounded-sm font-semibold text-brand transition-colors duration-200 ease-out hover:text-brand-hover hover:underline"
    >
      {link.label}
    </Link>,
    i < terms.links.length - 1 ? (
      <span key={`joiner-${i}`} className="mx-1.5">
        {terms.joiner}
      </span>
    ) : null,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || success) return;

    setSubmitting(true);
    try {
      const res = await postJson("/api/auth/signup", {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (!res.ok) {
        // Surface the API's own message (validation, duplicate email, …).
        let message: string | null = null;
        try {
          const data = (await res.json()) as { error?: { message?: string } };
          message = data.error?.message ?? null;
        } catch {
          // no JSON body to read — fall through to the generic message
        }
        throw new Error(message ?? "request_failed");
      }
      toast({ ...toasts.signup.success, variant: "success" });
      setSuccess(true);
    } catch (err) {
      // A fetch rejection is a genuine network problem; our own sentinel errors
      // (unknown response shape) fall back to the generic message; anything else
      // is the auth service speaking and is shown verbatim.
      const sentinels = new Set(["request_failed", "csrf_failed"]);
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: toasts.signup.error,
        description:
          sentinels.has(msg) || msg === ""
            ? fetchError ?? signup.form.errors.server
            : msg,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Kept outside the catch so the network-vs-service decision stays legible.
  const fetchError =
    typeof navigator !== "undefined" && !navigator.onLine
      ? signup.form.errors.network
      : signup.form.errors.server;

  function continueWith(provider: ProviderKey) {
    if (pendingProvider || submitting) return;
    setPendingProvider(provider);

    /* Hands the browser to the provider. This does not come back on success —
       the page unloads — so the spinner is deliberately left showing. */
    const result = startOAuth(provider);
    if (!result.ok) {
      toast({
        title: toasts.signup.error,
        description: result.message,
        variant: "error",
      });
      setPendingProvider(null);
    }
  }

  const fieldClass = cn(
    "h-12 w-full rounded-control border border-line bg-bg-elevated px-4 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
    "placeholder:text-ink-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25",
  );

  if (success) {
    return (
      <div className="w-full max-w-[26rem]">
        <span className="inline-flex size-12 items-center justify-center rounded-tile bg-brand-soft text-brand">
          <CircleCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </span>

        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          {signup.form.success.title}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
          {signup.form.success.message}
        </p>

        <ButtonLink href="/signin" size="lg" className="mt-6 w-full">
          {signup.form.success.actionLabel}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[26rem]">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
        {signup.form.title}
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {signup.form.subtitle}
      </p>

      {/* Social logins -------------------------------------------------- */}
      <div className="mt-7">
        <p className="font-mono text-xs tracking-[0.12em] text-ink-subtle uppercase">
          {signup.form.oauthLabel}
        </p>
        <div className="mt-3">
          <SocialButtons
            pendingProvider={pendingProvider}
            disabled={submitting}
            onContinue={continueWith}
          />
        </div>
      </div>

      {/* Divider --------------------------------------------------------- */}
      <div role="separator" aria-hidden="true" className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-subtle">{signup.form.divider}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Account form ---------------------------------------------------- */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-ink">
            {signup.form.name.label}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={signup.form.name.placeholder}
            className={fieldClass}
          />
          <p id="name-hint" className="mt-1.5 text-sm text-ink-subtle">
            {signup.form.name.hint}
          </p>
        </div>

        {/* Work email */}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">
            {signup.form.email.label}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={signup.form.email.placeholder}
            className={fieldClass}
          />
          <p id="email-hint" className="mt-1.5 text-sm text-ink-subtle">
            {signup.form.email.hint}
          </p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">
            {signup.form.password.label}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signup.form.password.placeholder}
              className={cn(fieldClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? signup.form.password.hide : signup.form.password.show}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors duration-200 ease-out hover:bg-bg-muted hover:text-ink active:bg-bg-inset"
            >
              {showPassword ? (
                <EyeOff className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Eye className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting || success}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {signup.form.submitting}
            </>
          ) : (
            signup.form.submit
          )}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs leading-relaxed text-ink-subtle">
        {terms.prefix} {termsLinks}
        {terms.punctuation}
      </p>

      <p className="mt-6 border-t border-line pt-6 text-center text-sm text-ink-muted">
        {signup.form.signInPrompt}{" "}
        <Link
          href="/signin"
          className="rounded-sm font-semibold text-brand transition-colors duration-200 ease-out hover:text-brand-hover"
        >
          {signup.form.signInLink}
        </Link>
      </p>
    </div>
  );
}