"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { SocialButtons } from "@/components/signup/SocialButtons";
import { postJson } from "@/lib/api/csrf-client";
import { startOAuth } from "@/lib/auth/oauth-client";
import type { ProviderKey } from "@/lib/contracts";
import { signin, toasts } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Reads the post-sign-in destination out of a successful response.
 *
 * The API decides it from the user's onboarding state, so this only has to
 * refuse anything it does not recognise. It is not a security boundary — the
 * value is same-origin by construction and the route it names is session-gated
 * anyway — but an unknown value still falls back to `/company` rather than being
 * handed to the router, so a malformed response degrades to the old behaviour
 * instead of navigating somewhere unexpected.
 */
async function readRedirectTo(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { redirectTo?: unknown };
    return typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
      ? data.redirectTo
      : "/company";
  } catch {
    return "/company";
  }
}

/**
 * Sign-in form on `/signin` — the email/password counterpart to `SignupForm`.
 * Same contract style: social buttons on top, divider, then credentials that
 * POST to the `/api/auth/signin` seam.
 */
export function SignInForm({
  initialError = null,
  initialHint = null,
}: {
  /**
   * Set when the page was loaded by an OAuth callback that failed, so the reason
   * is on screen immediately instead of the user landing on a clean form with no
   * idea why they are back here.
   */
  initialError?: string | null;
  /** Explains provider-console causes for "it works for some accounts". */
  initialHint?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [formError, setFormError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<ProviderKey | null>(null);

  const router = useRouter();
  const copy = signin.form;
  const { toast } = useToast();

  /**
   * Reports a failure twice: as the toast, which everyone sees and which
   * clears itself after five seconds, and as `formError`, which is what keeps
   * the provider-console hint underneath it on screen.
   */
  function showError(message: string) {
    setFormError(message);
    toast({ title: toasts.signin.error, description: message, variant: "error" });
  }

  /* An OAuth callback that failed hands the reason down from the server
     component, so the toast has to be raised on arrival rather than from a
     handler. `initialError` is a render-time constant, so this runs once. */
  useEffect(() => {
    if (initialError) {
      toast({ title: toasts.signin.error, description: initialError, variant: "error" });
    }
  }, [initialError, toast]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || success) return;

    setSubmitting(true);
    try {
      const res = await postJson("/api/auth/signin", {
        email: email.trim(),
        password,
      });
      if (!res.ok) {
        // Surface the API's own message (bad credentials, blocked, …).
        let message: string | null = null;
        try {
          const data = (await res.json()) as { error?: { message?: string } };
          message = data.error?.message ?? null;
        } catch {
          // no JSON body to read — fall through to the generic message
        }
        throw new Error(message ?? "request_failed");
      }
      toast({ ...toasts.signin.success, variant: "success" });
      setSuccess(true);
      // The API returns where this user's onboarding state says they belong:
      // `/company` if they have never completed the profile, otherwise the next
      // step — `/data` to share reports, or `/chat` once onboarding is done.
      // Sending everyone to `/company` used to drop a returning user onto a
      // form they had already submitted.
      router.push(await readRedirectTo(res));
    } catch (err) {
      const sentinels = new Set(["request_failed", "csrf_failed"]);
      const msg = err instanceof Error ? err.message : "";
      showError(
        sentinels.has(msg) || msg === ""
          ? fetchError ?? copy.errors.server
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fetchError =
    typeof navigator !== "undefined" && !navigator.onLine
      ? copy.errors.network
      : copy.errors.server;

  function continueWith(provider: ProviderKey) {
    if (pendingProvider || submitting) return;
    setPendingProvider(provider);

    /* Hands the browser to the provider. This does not come back on success —
       the page unloads — so the spinner is deliberately left showing. */
    const result = startOAuth(provider);
    if (!result.ok) {
      showError(result.message);
      setPendingProvider(null);
    }
  }

  const fieldClass = cn(
    "h-12 w-full rounded-control border border-line bg-bg-elevated px-4 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
    "placeholder:text-ink-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25",
  );

  return (
    <div className="relative w-full max-w-[26rem]">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
        {copy.title}
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
        {copy.subtitle}
      </p>

      {/* Social logins -------------------------------------------------- */}
      <div className="mt-7">
        <p className="font-mono text-xs tracking-[0.12em] text-ink-subtle uppercase">
          {copy.oauthLabel}
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
        <span className="text-xs text-ink-subtle">{copy.divider}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Error toast — appears right under the divider */}
      <div className="my-7 h-0" aria-hidden="true" />

      {/* Provider-console explanation, shown only for a failed social attempt. */}
      {formError && initialHint ? (
        <p className="mt-3 rounded-control border border-line bg-bg-muted p-3 text-xs leading-relaxed text-ink-muted">
          {initialHint}
        </p>
      ) : null}

      {/* Credentials ------------------------------------------------------ */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Work email */}
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

        {/* Password + forgot link */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="password" className="block text-sm font-semibold text-ink">
              {copy.password.label}
            </label>
            <Link
              href="/forgot-password"
              className="rounded-sm text-sm font-semibold text-brand transition-colors duration-200 ease-out hover:text-brand-hover"
            >
              {copy.forgot}
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={copy.password.placeholder}
              className={cn(fieldClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? copy.password.hide : copy.password.show}
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
    </div>
  );
}