import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { howItWorks } from "@/lib/content";

/**
 * "How it works" — four numbered steps.
 *
 * Timeline geometry:
 *  - Mobile: a 1px vertical rule pinned at x = half the badge, running between
 *    the first and last badge centres.
 *  - Desktop: the same rule rotates to horizontal, spanning between the first
 *    and last badge centres.
 *
 * Both are pure CSS on a single absolutely-positioned element, so the connector
 * stays pixel-aligned with the badges at any width without JS measurement.
 */
export function HowItWorks() {
  return (
    <section
      id={howItWorks.id}
      aria-labelledby="how-it-works-heading"
      className="section-y scroll-mt-24"
    >
      <Container>
        <SectionHeading
          eyebrow={howItWorks.eyebrow}
          title={howItWorks.title}
          intro={howItWorks.intro}
          titleId="how-it-works-heading"
          align="center"
        />

        <div className="relative mt-12 lg:mt-16">
          {/* Connector line — vertical on mobile, horizontal from md up */}
          <div
            aria-hidden="true"
            className="absolute top-[1.375rem] bottom-[1.375rem] left-[1.34375rem] w-px bg-line md:top-[1.375rem] md:right-[1.34375rem] md:bottom-auto md:left-[1.34375rem] md:h-px md:w-auto"
          />

          <ol className="relative grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-x-8 md:gap-y-12 lg:grid-cols-4 lg:gap-6">
            {howItWorks.steps.map((step, index) => (
              <Reveal
                as="li"
                key={step.title}
                delay={index * 0.1}
                className="relative flex gap-4 md:flex-col md:items-center md:gap-0 md:text-center"
              >
                {/* Badge: number + icon, centred on the connector line */}
                <span className="relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-bg-elevated font-mono text-sm font-bold text-brand shadow-sm">
                  {index + 1}
                </span>

                <div className="md:mt-6">
                  {/* Icon sits beside the badge on mobile, above the title on desktop */}
                  <span className="mb-3 inline-flex size-10 items-center justify-center rounded-tile bg-brand-soft text-brand md:size-9">
                    <Icon name={step.icon} className="size-[1.125rem]" />
                  </span>

                  <h3 className="font-display text-base font-semibold text-ink md:text-lg">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
