import { Check } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { cta } from "@/lib/content";

/**
 * Closing call-to-action — a full-width high-contrast gradient band.
 *
 * The band is a decorative wrapper: the buttons inside it already meet AA on
 * the darkest and lightest stops, and the reassurance line is legible white at
 * 88% opacity, so no text relies on the gradient for contrast.
 *
 * The band colours come from the fixed `--band-*` tokens, NOT from `--brand`.
 * `--brand` flips to a light blue in dark theme, which would put white text on
 * a light background and fail contrast. The button styling is applied through
 * the `inverse` / `inverseOutline` variants — see the warning in Button.tsx
 * about why these must not be restyled via className.
 */
export function CTASection() {
  return (
    <section aria-labelledby="cta-heading" className="section-y">
      <Container>
        <Reveal className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,var(--band-from)_0%,var(--band-mid)_45%,var(--band-to)_100%)] px-6 py-14 shadow-xl sm:px-12 sm:py-16 lg:px-16 lg:py-20">
          {/* Decorative light sweeps */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-0"
          >
            <div className="absolute -top-24 -left-16 size-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -right-20 -bottom-28 size-80 rounded-full bg-accent/25 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <p className="font-mono text-xs font-medium tracking-[0.12em] text-band-fg-muted uppercase">
              {cta.eyebrow}
            </p>

            <h2
              id="cta-heading"
              className="mt-3 font-display text-3xl leading-[1.15] font-bold text-band-fg sm:text-4xl lg:text-[2.75rem]"
            >
              {cta.title}
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-band-fg-muted sm:text-lg">
              {cta.supporting}
            </p>

            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={cta.primary.href} size="lg" variant="inverse">
                {cta.primary.label}
              </ButtonLink>
              <ButtonLink href={cta.secondary.href} size="lg" variant="inverseOutline">
                {cta.secondary.label}
              </ButtonLink>
            </div>

            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-xs text-band-fg-muted">
              {cta.reassurance.split(" · ").map((part, i) => (
                <span key={part} className="flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                  )}
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  {part}
                </span>
              ))}
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
