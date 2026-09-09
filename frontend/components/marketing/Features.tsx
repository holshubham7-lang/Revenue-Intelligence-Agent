import type { IconName } from "@/components/ui/Icon";
import { Icon } from "@/components/ui/Icon";

const FEATURES: ReadonlyArray<{
  icon: IconName;
  title: string;
  description: string;
}> = [
  {
    icon: "target",
    title: "Find leaks your tools miss",
    description:
      "The agent maps your funnel, spots drop-offs and wiring gaps, and shows the revenue impact of each one.",
  },
  {
    icon: "question",
    title: "An assessment that learns you",
    description:
      "A short AI-led conversation turns your company profile into a tailored baseline in minutes.",
  },
  {
    icon: "priority",
    title: "A prioritized action plan",
    description:
      "Get a 30-day plan ranked by projected ROI, so you always know the next highest-leverage move.",
  },
  {
    icon: "shield",
    title: "Secure by design",
    description:
      "Enterprise-grade handling of your data, with access that stays inside your workspace.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-24 border-y border-brand-100 bg-gradient-to-b from-brand-50 via-brand-50/50 to-surface"
    >
      <div className="container-site py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">
            What you get
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
            Turn scattered revenue data into a clear growth plan
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-muted">
            Stop guessing where growth gets stuck. The Revenue Agent connects,
            assesses, and prioritizes — so you act with confidence.
          </p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="group rounded-2xl border border-line bg-surface p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-600/[0.06]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                <Icon name={feature.icon} size={21} />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-ink">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}