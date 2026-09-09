import type { Metadata } from "next";
import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { SignInForm } from "@/components/auth/SignInForm";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { SocialLoginErrorToast } from "@/components/auth/SocialLoginErrorToast";
import { Icon } from "@/components/ui/Icon";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/sign-in", {
  title: "Sign In",
  robots: { index: false, follow: false },
});

export default function SignInPage() {
  return (
    <AuthGate
      heading="Sign in to StratVeda OS"
      subtitle="Access your revenue operating view. Use your company identity to continue securely."
    >
      <SocialLoginErrorToast />
      <SocialLoginButtons />

      <div className="relative my-7 flex items-center gap-4" role="separator">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
          or continue with email
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <SignInForm />

      <p className="mt-7 text-center text-sm text-ink-muted">
        New to StratVeda OS?{" "}
        <Link
          href="/sign-up"
          className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
        >
          Create a free account
        </Link>
      </p>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
        <Icon name="shield" size={14} className="text-brand-600" />
        Protected by 256-bit encryption · SOC 2-ready
      </p>
    </AuthGate>
  );
}