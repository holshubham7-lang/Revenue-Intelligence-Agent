import { Icon } from "@/components/ui/Icon";

const STEPS: ReadonlyArray<{
  number: string;
  title: string;
  description: string;
  icon: "upload" | "spark" | "trend";
}> = [
  {
    number: "01",
    icon: "upload",
    title: "Tell us about your business",
    description:
      "Share your company profile and revenue setup. No spreadsheets required.",
  },
  {
    number: "02",
    icon: "spark",
    title: "Get assessed by AI",
    description:
      "The agent asks a few sharp questions and builds your revenue baseline live.",
  },
  {
    number: "03",
    icon: "trend",
    title: "Act on the plan",
    description:
      "Follow a prioritized 30-day roadmap ranked by projected revenue impact.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-line bg-surface-muted/70">
      <div className="container-site py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-600">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
            From sign-up to plan in minutes
          </h2>
        </div>

        <ol className="mt-12 grid gap-10 lg:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number} className="relative flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-brand-200 bg-surface text-brand-700 shadow-sm">
                  <Icon name={step.icon} size={22} />
                </span>
                <span className="tabular text-sm font-semibold tracking-[0.14em] text-brand-600">
                  STEP {step.number}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}