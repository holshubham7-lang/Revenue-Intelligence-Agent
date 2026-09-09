"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/components/ui/ToastProvider";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Status = "idle" | "submitting";
type FieldErrors = Partial<Record<"email" | "password", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClasses =
  "w-full rounded-xl border border-line bg-surface-soft/60 px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const errorInputClasses =
  "border-danger-600 bg-danger-50/40 focus:border-danger-600 focus:ring-danger-600/20";

export function SignInForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = "Please provide a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "Check your details",
        description: Object.values(errors)[0],
        variant: "error",
      });
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch(`${API_URL}/auth/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const body = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;

      if (response.ok) {
        toast({
          title: "Welcome back",
          description: "Signed in successfully. Redirecting…",
          variant: "success",
        });
        router.replace("/dashboard");
        return;
      }

      const message = body?.message;
      const errorMessage =
        typeof message === "string"
          ? message
          : Array.isArray(message)
            ? message[0]
            : "Something went wrong. Please try again.";
      toast({ title: "Sign in failed", description: errorMessage, variant: "error" });
    } catch {
      toast({
        title: "Network error",
        description: `Cannot reach the signin service at ${API_URL}. Is the API running?`,
        variant: "error",
      });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-invalid={Boolean(fieldErrors.email)}
          className={cn(inputClasses, fieldErrors.email && errorInputClasses)}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          aria-invalid={Boolean(fieldErrors.password)}
          className={cn(fieldErrors.password && errorInputClasses)}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-muted">
          <input
            type="checkbox"
            defaultChecked
            className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
          />
          Keep me signed in for 30 days
        </label>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full disabled:opacity-60"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}