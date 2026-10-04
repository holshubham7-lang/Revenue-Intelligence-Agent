import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth/AuthHeader";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { forgotPassword, site } from "@/lib/content";

export const metadata: Metadata = {
  title: forgotPassword.meta.title,
  description: forgotPassword.meta.description,
};

/**
 * Password reset request — a single focused card instead of the full split
 * screen, so someone who clicked "Forgot password?" lands on exactly one job.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[100svh] flex-col bg-bg">
      {/* Top bar — brand */}
      <AuthHeader />

      {/* Card */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <ForgotPasswordForm />
      </div>

      {/* Slim credit */}
      <p className="shrink-0 px-5 pb-6 text-center text-xs text-ink-subtle sm:px-8">
        {site.copyright.prefix}{" "}
        <a
          href={site.copyright.brandHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm font-medium text-ink transition-colors duration-200 ease-out hover:text-brand"
        >
          {site.copyright.brandLabel}
        </a>
        {site.copyright.suffix}
      </p>
    </main>
  );
}