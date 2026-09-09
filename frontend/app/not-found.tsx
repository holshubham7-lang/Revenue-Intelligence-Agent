import { cookies } from "next/headers";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SITE } from "@/lib/constants";

const SESSION_COOKIE_NAME = "stratveda_session";

export default async function NotFound() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has(SESSION_COOKIE_NAME);
  const homeHref = isLoggedIn ? "/dashboard" : "/";

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface px-4 py-20 text-center">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
            <Icon name="search" size={26} />
          </span>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-brand-600">
            404 — Page not found
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
            This page is off-script.
          </h1>
          <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-ink-muted">
            The page you&apos;re looking for doesn&apos;t exist or may have
            moved. Let&apos;s get you back to a page that does.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            href={homeHref}
            variant="primary"
            size="md"
            className="w-full sm:w-auto"
          >
            <Icon name="arrow-left" size={16} />
            {isLoggedIn ? "Go to dashboard" : "Back to home"}
          </Button>
          {!isLoggedIn ? (
            <Button
              href="/sign-in"
              variant="secondary"
              size="md"
              className="w-full sm:w-auto"
            >
              Go to sign in
            </Button>
          ) : null}
        </div>

        <p className="mt-10 text-[0.6875rem] text-ink-faint">
          &copy; {new Date().getFullYear()} {SITE.name}. {SITE.product}.
        </p>
      </div>
    </main>
  );
}