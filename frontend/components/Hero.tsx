import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { HeroMockup } from "@/components/HeroMockup";
import { hero } from "@/lib/content";

/**
 * Above-the-fold hero. Server Component — no client JS on the critical path.
 *
 * Entrance animation for the copy is CSS-only (see the `animate-in` helpers in
 * globals.css) so it runs before hydration and is disabled automatically under
 * prefers-reduced-motion.
 */
export function Hero() {
  return (
    <section
      id="product"
      aria-labelledby="hero-heading"
      className="relative scroll-mt-24 overflow-hidden"
    >
      {/* Ambient background wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_50%_0%,var(--brand-soft)_0%,transparent_65%)]"
      />

      <Container>
        <div className="grid items-center gap-12 py-14 sm:py-16 lg:grid-cols-2 lg:gap-14 lg:py-24">
          {/* ---------------------------------------------------------- Copy */}
          <div className="max-w-xl">
            <p className="animate-in inline-flex items-center gap-2 rounded-pill border border-brand-line bg-bg-elevated px-3 py-1.5 font-mono text-[0.6875rem] font-medium tracking-wide text-brand-soft-fg uppercase">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
              {hero.eyebrow}
            </p>

            <h1
              id="hero-heading"
              className="animate-in-delay-1 mt-5 font-display text-4xl leading-[1.08] font-bold text-ink sm:text-5xl lg:text-[3.5rem]"
            >
              {hero.headline.lead}{" "}
              <span className="relative whitespace-nowrap text-brand">
                {hero.headline.highlight}
                {/* Hand-drawn-style underline accent */}
                <svg
                  viewBox="0 0 300 12"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 left-0 h-2.5 w-full text-accent"
                  fill="none"
                  focusable="false"
                  aria-hidden="true"
                >
                  <path
                    d="M2 9.5C58 4.2 122 2.4 180 4.1c38 1.1 76 3 118 5.4"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            <p className="animate-in-delay-2 mt-6 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">
              {hero.subheadline}
            </p>

            <div className="animate-in-delay-3 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={hero.primaryCta.href} variant="primary" size="lg">
                {hero.primaryCta.label}
                <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href={hero.secondaryCta.href} variant="outline" size="lg">
                {hero.secondaryCta.label}
              </ButtonLink>
            </div>

            <p className="animate-in-delay-3 mt-5 flex items-center gap-2 font-mono text-xs text-ink-subtle">
              <span
                className="inline-flex size-4 items-center justify-center rounded-full bg-positive-soft text-positive"
                aria-hidden="true"
              >
                <Check className="size-2.5" strokeWidth={3} />
              </span>
              {hero.trustLine}
            </p>
          </div>

          {/* -------------------------------------------------------- Visual */}
          <div className="animate-in-delay-2 lg:pl-4">
            <HeroMockup />
          </div>
        </div>
      </Container>
    </section>
  );
}
