import type { Metadata } from "next";

import { AuthHeader } from "@/components/auth/AuthHeader";
import { BrandPanel } from "@/components/signup/BrandPanel";
import { SignupForm } from "@/components/signup/SignupForm";
import { signup, site } from "@/lib/content";

export const metadata: Metadata = {
  title: signup.meta.title,
  description: signup.meta.description,
};

/**
 * Sign-up page — a full-height split screen.
 *
 * Server Component by default: only `SignupForm` (the one client island on the
 * route) ships JavaScript. The layout reuses the layout-less auth-column
 * pattern: a fixed brand panel on `lg+`, and a compact brand header on small
 * screens where the panel is hidden.
 */
export default function SignupPage() {
  return (
    <main className="min-h-[100svh] bg-bg lg:grid lg:grid-cols-2">
      {/* Left: brand story (desktop) */}
      <BrandPanel />

      {/* Right: form column */}
      <section className="flex flex-col">
        {/* Top bar — brand (mobile) + back home */}
        <AuthHeader brandInPanel backHome />

        {/* Form */}
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <SignupForm />
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
      </section>
    </main>
  );
}