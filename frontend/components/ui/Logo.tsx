import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  href?: string;
};

const LOGO_SRC = "https://www.stratvedatech.com/logo.png";

export function Logo({ className, href = "/" }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="StratVeda OS — home"
    >
      <Image
        src={LOGO_SRC}
        alt="StratVeda"
        width={44}
        height={44}
        className="size-11 shrink-0"
        priority
      />
      <span className="text-[1.25rem] font-bold tracking-[-0.02em] text-ink">
        StratVeda <span className="font-semibold text-brand-700">OS</span>
      </span>
    </Link>
  );
}

export function LogoInverse({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={LOGO_SRC}
        alt="StratVeda"
        width={44}
        height={44}
        className="size-11 shrink-0"
      />
      <span className="text-[1.25rem] font-bold tracking-[-0.02em] text-white">
        StratVeda <span className="font-semibold text-brand-200">OS</span>
      </span>
    </span>
  );
}