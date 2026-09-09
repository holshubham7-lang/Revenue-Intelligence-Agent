import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function CtaBand() {
  return (
    <section>
      <div className="container-site py-16 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 px-6 py-14 text-center sm:px-12 lg:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 size-[26rem] -translate-x-1/2 rounded-full bg-brand-400/25 blur-3xl"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
              Know your next highest-ROI move today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-brand-100/90">
              Join growing businesses that stopped guessing about growth. Get
              your revenue readiness assessment in minutes.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/sign-up" variant="secondary" size="lg">
                Start free
              </Button>
              <Link
                href="/sign-in"
                className="inline-flex h-13 cursor-pointer items-center justify-center rounded-xl px-7 text-base font-semibold text-brand-100 underline decoration-brand-100/40 underline-offset-4 transition-colors duration-200 hover:text-white hover:decoration-white"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-7 text-sm text-brand-100/70">
              No credit card required · Set up in under 5 minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}