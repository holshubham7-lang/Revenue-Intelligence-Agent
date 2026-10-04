import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { header } from "@/lib/content";

/**
 * Sticky header: brand on the left, the two account actions on the right.
 *
 * This is a **Server Component** — it holds no state, opens no menu, and needs
 * no scroll listener, so it ships zero client JavaScript. The translucent
 * background and bottom border are applied unconditionally rather than being
 * toggled on scroll, which is what previously forced the `useEffect` here.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[var(--header-bg)] shadow-sm backdrop-blur-md backdrop-saturate-150">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4 sm:h-[4.5rem]">
          <Link
            href="/"
            className="rounded-control focus-visible:outline-2"
            aria-label={`${header.brand.homeLabel}`}
          >
            <Logo />
          </Link>

          <nav aria-label={header.accountMenuLabel}>
            <ul className="flex items-center gap-2">
              <li>
                <ButtonLink
                  href={header.actions.signIn.href}
                  variant="ghost"
                  size="sm"
                >
                  {header.actions.signIn.label}
                </ButtonLink>
              </li>
              <li>
                <ButtonLink
                  href={header.actions.signUp.href}
                  variant="primary"
                  size="sm"
                >
                  {header.actions.signUp.label}
                </ButtonLink>
              </li>
            </ul>
          </nav>
        </div>
      </Container>
    </header>
  );
}
