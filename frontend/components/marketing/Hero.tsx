import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

const HERO_POINTS = [
  "AI-driven assessment in minutes",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-[-8%] size-[34rem] max-w-[90vw] rounded-full bg-gradient-to-tr from-brand-200/60 via-brand-100/50 to-transparent blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-[-6%] size-[28rem] max-w-[90vw] rounded-full bg-gradient-to-br from-brand-100/50 to-transparent blur-3xl"
      />

      <div className="container-site relative grid items-center gap-14 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-brand-800">
            <Icon name="spark" size={15} className="text-brand-600" />
            StratVeda OS Revenue Intelligence Agent
          </div>

          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-5xl">
            Discover Hidden{" "}
            <span className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-400 bg-clip-text text-transparent">
              Revenue Leaks
            </span>{" "}
            Before They Cost You Growth
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
            Measure revenue impact, prioritize high-ROI opportunities, and get
            a clear 30-day action plan backed by your own data.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="/sign-up" variant="primary" size="lg">
              Start free
              <Icon name="arrow-right" size={18} className="text-white" />
            </Button>
            <Button href="#features" variant="secondary" size="lg">
              See how it works
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {HERO_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 text-sm font-medium text-ink-muted"
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon name="check" size={13} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:mx-0">
          <div
            aria-hidden="true"
            className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-200/50 to-brand-50"
          />
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-xl shadow-ink/[0.06]">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                <Icon name="spark" size={19} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  Revenue Agent
                </p>
                <p className="text-xs text-ink-faint">
                  Assessment · just now
                </p>
              </div>
              <span className="ml-auto rounded-full bg-brand-600 px-2.5 py-1 text-[0.6875rem] font-semibold text-white">
                AI
              </span>
            </div>

            <div className="mt-5">
              <div className="flex items-end justify-between">
                <p className="text-sm font-medium text-ink-muted">
                  Revenue Readiness Score
                </p>
                <p className="tabular text-2xl font-bold tracking-tight text-ink">
                  68<span className="text-sm font-semibold text-ink-faint">/100</span>
                </p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  aria-hidden="true"
                  className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                />
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Better than 62% of similar businesses
              </p>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-ink">
                Top actions this month
              </p>
              <ul className="mt-3 space-y-3">
                {[
                  { label: "Unify pipeline tracking across sources", priority: "High", tone: "bg-brand-50 text-brand-800" },
                  { label: "Automate win-rate reporting for your team", priority: "Medium", tone: "bg-surface-muted text-ink-muted" },
                ].map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 rounded-xl border border-line bg-surface-soft px-3.5 py-3"
                  >
                    <Icon name="target" size={17} className="mt-0.5 shrink-0 text-brand-600" />
                    <span className="flex-1 text-sm font-medium leading-snug text-ink">
                      {item.label}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${item.tone}`}
                    >
                      {item.priority}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}