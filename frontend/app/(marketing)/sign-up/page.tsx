import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { SocialLoginErrorToast } from "@/components/auth/SocialLoginErrorToast";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/sign-up", {
  title: "Start Free",
  robots: { index: false, follow: false },
});

export default function SignUpPage() {
  return (
    <AuthGate
      heading="Start free with StratVeda OS"
      subtitle="Set up your revenue operating view in under 5 minutes. No credit card required."
    >
      <SocialLoginErrorToast />
      <SocialLoginButtons />

      <div className="relative my-7 flex items-center gap-4" role="separator">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
          or sign up with email
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <SignUpForm />

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
        By creating an account you agree to our{" "}
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthGate>
  );
}