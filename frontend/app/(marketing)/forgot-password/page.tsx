"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClasses =
  "w-full rounded-xl border border-line bg-surface-soft/60 px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const errorInputClasses =
  "border-danger-600 bg-danger-50/40 focus:border-danger-600 focus:ring-danger-600/20";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [hasError, setHasError] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setHasError(true);
      toast({
        title: "Check your details",
        description: "Email is required",
        variant: "error",
      });
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setHasError(true);
      toast({
        title: "Check your details",
        description: "Please provide a valid email address",
        variant: "error",
      });
      return;
    }

    setHasError(false);
    toast({
      title: "Reset link sent",
      description:
        "If an account exists for that email, we've sent a secure link to set a new password.",
      variant: "success",
    });
    setEmail("");
  }

  return (
    <AuthGate
      heading="Reset your password"
      subtitle="Enter your work email and we'll send you a secure link to set a new password."
    >
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
            onChange={(e) => {
              setEmail(e.target.value);
              setHasError(false);
            }}
            placeholder="you@company.com"
            aria-invalid={hasError}
            className={cn(inputClasses, hasError && errorInputClasses)}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full">
          Send reset link
        </Button>
      </form>

      <div className="mt-6 space-y-3 text-center text-sm text-ink-muted">
        <p>
          Remembered it?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
        <Icon name="shield" size={14} className="text-brand-600" />
        We&apos;ll never ask for your password by email.
      </p>
    </AuthGate>
  );
}