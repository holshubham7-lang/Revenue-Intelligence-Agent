import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { features } from "@/lib/content";

/**
 * "What you get" — six capability cards.
 *
 * The grid steps 1 → 2 → 3 columns. Hover lifts the card and warms the border
 * toward the brand colour; both are colour/shadow-only transitions, so the
 * layout never shifts and there is no jitter on press.
 */
export function WhatYouGet() {
  return (
    <section
      id={features.id}
      aria-labelledby="features-heading"
      className="section-y scroll-mt-24 border-t border-line bg-bg-elevated"
    >
      <Container>
        <SectionHeading
          eyebrow={features.eyebrow}
          title={features.title}
          intro={features.intro}
          titleId="features-heading"
        />

        <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          {features.items.map((feature, index) => (
            <Reveal as="li" key={feature.title} delay={index * 0.06} className="h-full">
              <article className="group flex h-full flex-col rounded-card border border-line bg-bg p-6 transition-[border-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-1 hover:border-brand-line hover:shadow-lg">
                <span className="inline-flex size-11 items-center justify-center rounded-tile bg-brand-soft text-brand transition-colors duration-300 ease-out group-hover:bg-brand group-hover:text-brand-fg">
                  <Icon name={feature.icon} className="size-[1.375rem]" />
                </span>

                <h3 className="mt-5 font-display text-lg font-semibold text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {feature.description}
                </p>
              </article>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
