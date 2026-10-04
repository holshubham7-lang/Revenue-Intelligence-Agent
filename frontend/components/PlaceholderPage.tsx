import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { placeholderBody, site } from "@/lib/content";

/**
 * Shared shell for the placeholder routes (signin, signup, pricing, policies).
 *
 * It still renders the real Header and Footer so navigation stays consistent,
 * and it uses a `<main>` landmark so the skip link keeps working.
 */
export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <Header />

      <main id="main-content" className="flex-1">
        <section className="section-y">
          <Container size="narrow">
            <span className="inline-flex size-12 items-center justify-center rounded-tile bg-brand-soft text-brand">
              <Construction className="size-6" strokeWidth={1.75} aria-hidden="true" />
            </span>

            <h1 className="mt-6 font-display text-3xl font-bold text-ink sm:text-4xl">
              {title}
            </h1>

            <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
              {description}
            </p>

            <p className="mt-4 rounded-card border border-line bg-bg-elevated p-5 text-[0.9375rem] leading-relaxed text-ink-muted">
              {placeholderBody}
            </p>

            <Link
              href="/"
              className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-[0.9375rem] font-semibold text-brand transition-colors duration-200 ease-out hover:bg-brand-soft"
            >
              <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
              Back to {site.name}
            </Link>
          </Container>
        </section>
      </main>

      <Footer />
    </>
  );
}
