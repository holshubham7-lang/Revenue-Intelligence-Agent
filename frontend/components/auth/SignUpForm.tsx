"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/components/ui/ToastProvider";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Status = "idle" | "submitting";
type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;

const NAME_PATTERN = /^[A-Za-z\s.'-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN =
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&._-]{8,}$/;

const inputClasses =
  "w-full rounded-xl border border-line bg-surface-soft/60 px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const errorInputClasses =
  "border-danger-600 bg-danger-50/40 focus:border-danger-600 focus:ring-danger-600/20";

export function SignUpForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      errors.name = "Full name is required";
    } else if (trimmedName.length < 2) {
      errors.name = "Full name must be at least 2 characters";
    } else if (!NAME_PATTERN.test(trimmedName)) {
      errors.name =
        "Full name can only contain letters, spaces, apostrophes, periods and hyphens";
    }

    if (!trimmedEmail) {
      errors.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = "Please provide a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (!PASSWORD_PATTERN.test(password)) {
      errors.password =
        "Use at least 8 characters with a mix of letters and numbers";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstMessage = Object.values(errors)[0];
      toast({
        title: "Check your details",
        description: firstMessage,
        variant: "error",
      });
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;

      if (response.ok) {
        toast({
          title: "Account created",
          description: "Welcome to RevOps! Redirecting to your dashboard…",
          variant: "success",
        });
        router.replace("/dashboard");
        return;
      }

      const message = body?.message;
      if (Array.isArray(message)) {
        toast({ title: "Sign up failed", description: message[0], variant: "error" });
      } else if (typeof message === "string") {
        toast({ title: "Sign up failed", description: message, variant: "error" });
      } else {
        toast({
          title: "Sign up failed",
          description: "Something went wrong. Please try again.",
          variant: "error",
        });
      }
    } catch {
      const message = `Cannot reach the signup service at ${API_URL}. Is the API running?`;
      toast({ title: "Network error", description: message, variant: "error" });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="full-name" className="mb-1.5 block text-sm font-medium text-ink">
          Full name
        </label>
        <input
          id="full-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
          aria-invalid={Boolean(fieldErrors.name)}
          className={cn(inputClasses, fieldErrors.name && errorInputClasses)}
        />
      </div>

      <div>
        <label htmlFor="work-email" className="mb-1.5 block text-sm font-medium text-ink">
          Work email
        </label>
        <input
          id="work-email"
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
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink">
          Password
        </label>
        <PasswordInput
          id="new-password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8+ characters"
          aria-invalid={Boolean(fieldErrors.password)}
          className={cn(fieldErrors.password && errorInputClasses)}
        />
        <p className="mt-1.5 text-xs text-ink-faint">
          Use at least 8 characters with a mix of letters and numbers.
        </p>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full disabled:opacity-60"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Creating account…" : "Create free account"}
      </Button>
    </form>
  );
}