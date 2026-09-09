"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { NAV } from "@/lib/constants";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-line bg-surface/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-md"
          : "border-b border-transparent bg-surface",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          "container-site flex items-center justify-between transition-all duration-300",
          scrolled ? "h-16" : "h-20",
        )}
      >
        <Logo />

        <div className="hidden items-center gap-3 lg:flex">
          <Button href={NAV.signIn.href} variant="ghost" size="md">
            {NAV.signIn.label}
          </Button>
          <Button href={NAV.signUp.href} variant="primary" size="md">
            {NAV.signUp.label}
          </Button>
        </div>

        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-xl border border-line text-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "menu"} size={22} />
        </button>
      </nav>

      <div
        id="mobile-menu"
        className={cn(
          "border-t border-line bg-surface transition-[max-height,opacity] duration-300 ease-out lg:hidden",
          open
            ? "max-h-96 opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden border-transparent opacity-0",
        )}
      >
        <div className="container-site flex flex-col gap-3 py-4">
          <Button href={NAV.signIn.href} variant="secondary" size="lg">
            {NAV.signIn.label}
          </Button>
          <Button href={NAV.signUp.href} variant="primary" size="lg">
            {NAV.signUp.label}
          </Button>
        </div>
      </div>
    </header>
  );
}