import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/ui/Logo";
import { site } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Shared top bar for the auth routes (`/signin`, `/signup`, `/forgot-password`).
 *
 * Always renders the one canonical `Logo` lockup, so the brand reads identically
 * on every auth page.
 */
export function AuthHeader({
  brandInPanel = false,
  backHome = false,
}: {
  /**
   * The split-screen brand panel already shows the lockup at `lg+`, so the
   * header's copy is hidden there to avoid a duplicate.
   */
  brandInPanel?: boolean;
  /** Show the "Back to home" action on the right. */
  backHome?: boolean;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
      <Link
        href="/"
        className={cn("rounded-control focus-visible:outline-2", brandInPanel && "lg:hidden")}
        aria-label={`${site.name} — home`}
      >
        <Logo />
      </Link>

      {backHome ? (
        // `ml-auto` keeps the action pinned right once the lockup above is
        // hidden at `lg+` and can no longer split the row.
        <Link
          href="/"
          className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink-muted transition-colors duration-200 ease-out hover:bg-bg-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
          Back to home
        </Link>
      ) : null}
    </div>
  );
}
