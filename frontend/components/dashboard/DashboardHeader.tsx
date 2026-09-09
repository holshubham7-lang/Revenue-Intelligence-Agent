"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SITE } from "@/lib/constants";

const LOGO_SRC = "https://www.stratvedatech.com/logo.png";

type DashboardHeaderProps = {
  user: { id: string; name: string; email: string };
  onLogout: () => void;
  onToggleSidebar: () => void;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function DashboardHeader({
  user,
  onLogout,
  onToggleSidebar,
}: DashboardHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Open chat history"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <Icon name="menu" size={20} />
          </button>
          <Image
            src={LOGO_SRC}
            alt="StratVeda"
            width={36}
            height={36}
            className="size-9 shrink-0"
            priority
          />
          <div className="hidden leading-tight md:block">
            <p className="text-sm font-bold tracking-[-0.01em] text-white">
              {SITE.name}
            </p>
            <p className="text-[0.6875rem] font-medium text-white/50">
              {SITE.product}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl p-1 pr-2 transition-colors hover:bg-white/10"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-sm font-semibold text-white">
                {initialsOf(user.name)}
              </span>
              <span className="hidden max-w-40 truncate text-left md:block">
                <span className="block truncate text-sm font-semibold text-white">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-white/50">
                  {user.email}
                </span>
              </span>
              <Icon
                name="chevron-down"
                size={16}
                className={menuOpen ? "text-brand-400" : "text-white/50"}
              />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-ink p-1.5 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)]"
              >
                <div className="border-b border-white/10 px-3 pb-2.5 pt-1.5">
                  <p className="truncate text-sm font-semibold text-white">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-white/50">
                    {user.email}
                  </p>
                </div>
                <div className="py-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/dashboard/account");
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Icon name="user" size={18} />
                    Account settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/dashboard/account#change-password");
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Icon name="lock" size={18} />
                    Change password
                  </button>
                </div>
                <div className="border-t border-white/10 py-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-danger-400 transition-colors hover:bg-danger-400/10 hover:text-danger-300"
                  >
                    <Icon name="logout" size={18} />
                    Log out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}