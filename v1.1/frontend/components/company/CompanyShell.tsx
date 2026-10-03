"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Crown,
  Database,
  LineChart,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { postJson } from "@/lib/api/csrf-client";
import { startNewChat } from "@/lib/chat-events";
import { company, site } from "@/lib/content";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  company: Building2,
  forecast: LineChart,
  findings: Sparkles,
  dataSources: Database,
  settings: Settings,
};

/** First letters of the first two words, uppercased — "Jane Doe" → "JD". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/**
 * The signed-in user's avatar: the provider photo from `users.profileImage` when
 * one is stored and loadable, otherwise their initials.
 *
 * Which URL lands here depends on how the account was created. Google and
 * LinkedIn store a publicly fetchable image that renders directly. Microsoft
 * stores an authenticated Graph endpoint (`/me/photo/$value`) that a bare `img`
 * cannot fetch, so a load failure falls back to the initials rather than leaving
 * a broken-image icon in the header.
 */
function UserAvatar({ name, image }: { name: string; image?: string }) {
  const [failed, setFailed] = useState(false);

  if (!image || failed) {
    return (
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-xs font-bold text-brand">
        {initials(name)}
      </span>
    );
  }

  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft">
      {/* eslint-disable-next-line @next/next/no-img-element -- provider-hosted avatars span several hostnames, so a fixed next/image allowlist does not fit */}
      <img
        src={image}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-8 object-cover"
      />
    </span>
  );
}

function SidebarNav({
  onNavigate,
  onSignOut,
  signingOut,
  signOutError,
  onSignOutErrorDismiss,
  chatHistory,
}: {
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
  onSignOutErrorDismiss: () => void;
  chatHistory?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { nav } = company;

  return (
    <div className="flex h-full flex-col">
      <nav aria-label={nav.label} className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {nav.items.map((item) => {
            const IconCmp = NAV_ICONS[item.key];
            // `/company` is matched exactly so a nested route (e.g.
            // `/company/action-plan`) never lights up its parent entry.
            const active =
              pathname === item.href ||
              (item.href !== "/company" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => {
                    onNavigate?.();
                    /* The Chat entry starts a new conversation as well as linking to
                       the page. Clicking it while the chat is already on screen is not
                       a navigation — and the address bar may name a conversation the
                       router was never told about — so the click has to say so. */
                    if (item.key === "chat" && pathname === item.href) {
                      startNewChat(item.href);
                    }
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-200 ease-out",
                    active
                      ? "bg-brand-soft font-semibold text-brand"
                      : "text-ink-muted hover:bg-bg-muted hover:text-ink",
                  )}
                >
                  {IconCmp ? (
                    <IconCmp
                      className="size-[1.125rem] shrink-0"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : null}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Route-specific section below the nav items — the chat workspace puts
            its recent conversations here. Only a link in it is a navigation, so
            only a link closes the mobile drawer; a delete button does not. */}
        {chatHistory ? (
          <div
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) onNavigate?.();
            }}
          >
            {chatHistory}
          </div>
        ) : null}
      </nav>

      {/* Footer of the sidebar — sign out */}
      <div className="border-t border-line px-3 py-4">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-negative/30 bg-negative-soft px-3 text-sm font-semibold text-negative transition-colors duration-200 ease-out hover:bg-negative/10 active:bg-negative/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {signingOut ? nav.signingOutLabel : nav.signOutLabel}
        </button>
        {signOutError ? (
          <button
            type="button"
            role="alert"
            onClick={onSignOutErrorDismiss}
            className="mt-2 w-full cursor-pointer rounded-control px-1 py-1 text-left text-xs leading-relaxed text-negative transition-colors duration-200 ease-out hover:bg-negative/10"
          >
            {signOutError}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Authenticated company workspace shell: floating header (greets the signed-in
 * user), left navigation column (a slide-over drawer below `lg`), the route
 * content, and a slim footer. The `user` comes from the `/company` layout,
 * which resolves it from the session cookie.
 *
 * Client only for the drawer state and sign-out; everything else is markup.
 */
export function CompanyShell({
  user,
  children,
  padded = true,
  chatHistory,
}: {
  user: { name: string; email: string; profileImage?: string };
  children: React.ReactNode;
  /**
   * Whether `main` supplies the page's inner padding. True for every route that
   * lets `main` be its scroll region; `/chat` sets it false because it scrolls a
   * region of its own, and a padded ancestor would inset that region's scrollbar
   * from the window edge instead of matching the bar every other page shows.
   */
  padded?: boolean;
  /**
   * Extra content for the navigation column, below the nav items. `/chat` passes
   * its recent conversations, which belong with the Chat entry rather than in a
   * second sidebar of their own. Rendered in the drawer as well as the desktop
   * column, so it is a slot the shell fills rather than markup a page appends.
   */
  chatHistory?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Secure sign-out.
   *
   * The server clears the httpOnly session cookie and rotates the account's
   * `tokenVersion`, which invalidates every token ever issued for it. We only
   * navigate once that call has actually succeeded — leaving on a failed
   * response would drop the user on `/signin` with a still-valid cookie they
   * could walk straight back through. A full document load (`location.assign`,
   * not a client `router.push`) also drops the client router cache so no
   * authenticated shell can be served from memory.
   */
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      // Sign-out is a state-changing POST, so it needs the double-submit token.
      const res = await postJson("/api/auth/signout");
      if (!res.ok) throw new Error("signout_failed");
    } catch {
      setSigningOut(false);
      setSignOutError(company.nav.signOutFailed);
      return;
    }
    // A full document load is the point here: a client-side `router.push`
    // would serve the authenticated shell straight out of the router cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard navigation after sign-out
    window.location.assign("/");
  }

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden bg-bg">
      {/* Header --------------------------------------------------------- */}
      <header className="z-40 shrink-0 border-b border-line bg-[var(--header-bg)] shadow-sm">
        <div className="flex h-16 items-center justify-between gap-4 px-5 sm:h-[4.5rem] sm:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={company.header.menuLabel}
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors duration-200 ease-out hover:bg-bg-muted hover:text-ink lg:hidden"
            >
              <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Link
              href="/company"
              className="rounded-control focus-visible:outline-2"
              aria-label={`${company.header.workspaceLabel} — ${site.name}`}
            >
              <Logo />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" className="hidden sm:inline-flex">
              <Crown className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {company.header.upgradeLabel}
            </Button>
            <div className="flex items-center gap-2.5 rounded-full border border-line bg-bg-elevated py-1.5 pr-4 pl-1.5 shadow-inner">
              <UserAvatar name={user.name} image={user.profileImage} />
              <span className="hidden max-w-44 truncate text-sm font-semibold text-ink md:block">
                {user.name}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Body ------------------------------------------------------------ */}
      <div className="flex min-h-0 flex-1">
        {/* Static sidebar (desktop) */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-bg-elevated/60 lg:block">
          <SidebarNav
            onSignOut={handleSignOut}
            signingOut={signingOut}
            signOutError={signOutError}
            onSignOutErrorDismiss={() => setSignOutError(null)}
            chatHistory={chatHistory}
          />
        </aside>

        {/* Slide-over drawer (mobile) */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={company.nav.label}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-bg shadow-xl"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
                <Link
                  href="/company"
                  onClick={() => setOpen(false)}
                  className="rounded-control focus-visible:outline-2"
                  aria-label={`${company.header.workspaceLabel} — ${site.name}`}
                >
                  <LogoMark />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={company.header.closeLabel}
                  className="inline-flex size-10 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors duration-200 ease-out hover:bg-bg-muted hover:text-ink"
                >
                  <X className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <SidebarNav
                onNavigate={() => setOpen(false)}
                onSignOut={handleSignOut}
                signingOut={signingOut}
                signOutError={signOutError}
                onSignOutErrorDismiss={() => setSignOutError(null)}
                chatHistory={chatHistory}
              />
            </div>
          </div>
        )}

        {/* Route content — the only scrollable region */}
        <main
          id="main-content"
          className={cn(
            "min-w-0 flex-1 overflow-y-auto",
            padded && "px-5 py-8 sm:px-10 lg:px-12",
          )}
        >
          {children}
        </main>
      </div>

      {/* Footer --------------------------------------------------------- */}
      <footer className="border-t border-line bg-bg-elevated">
        <p className="px-5 py-5 text-center text-xs text-ink-subtle sm:px-8">
          {site.copyright.prefix}{" "}
          <a
            href={site.copyright.brandHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-medium text-ink transition-colors duration-200 ease-out hover:text-brand"
          >
            {site.copyright.brandLabel}
          </a>
          {site.copyright.suffix}
        </p>
      </footer>
    </div>
  );
}