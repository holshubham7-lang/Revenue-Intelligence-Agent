import type { ReactNode } from "react";

type AuthGateProps = {
  heading: string;
  subtitle?: string;
  children: ReactNode;
};

export function AuthGate({ heading, subtitle, children }: AuthGateProps) {
  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-line bg-surface px-6 py-9 shadow-[0_32px_80px_-40px_rgba(15,23,42,0.35)] sm:px-10 sm:py-11">
          <header className="text-center">
            <h1 className="text-[1.5rem] font-bold tracking-[-0.02em] text-ink sm:text-[1.625rem]">
              {heading}
            </h1>
            {subtitle ? (
              <p className="mx-auto mt-2.5 max-w-sm text-[0.9375rem] leading-relaxed text-ink-muted">
                {subtitle}
              </p>
            ) : null}
          </header>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}