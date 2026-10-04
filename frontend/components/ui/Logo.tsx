import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Canonical brand mark, served from the marketing site. This is the same asset
 * v1.0 used, and its host is allow-listed in `next.config.ts`.
 *
 * It is a transparent PNG, so unlike the earlier bundled cropped JPEG it needs
 * no white backing plate and sits correctly on either theme.
 */
const LOGO_SRC = "https://www.stratvedatech.com/logo.png";

/** The mark on its own — no wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      width={40}
      height={40}
      className={cn("size-10 shrink-0 object-contain", className)}
      priority
    />
  );
}

/**
 * Full lockup: the mark, then the product name with its tagline beneath —
 * "StratVeda OS" over "Revenue Intelligence".
 */
export function Logo({
  className,
  wordmarkClassName,
  taglineClassName,
  tone = "theme",
}: {
  className?: string;
  wordmarkClassName?: string;
  taglineClassName?: string;
  /**
   * `light` pins the wordmark to fixed dark ink for a fixed-light surface
   * (e.g. the auth brand panel), where the theme-aware `--ink` tokens would
   * otherwise flip to near-white in dark mode and disappear.
   */
  tone?: "theme" | "light";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col justify-center leading-tight">
        <span
          className={cn(
            "font-display text-[1.0625rem] font-bold tracking-tight",
            tone === "light" ? "text-[#0f172a]" : "text-ink",
            wordmarkClassName,
          )}
        >
          StratVeda OS
        </span>
        <span
          className={cn(
            "text-[0.6875rem] font-medium",
            tone === "light" ? "text-[#334155]" : "text-ink-subtle",
            taglineClassName,
          )}
        >
          Revenue Intelligence
        </span>
      </span>
    </span>
  );
}
