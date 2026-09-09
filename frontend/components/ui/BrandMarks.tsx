import { cn } from "@/lib/utils";

export type BrandMarkSize = "sm" | "md";

export function MastercardMark({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 36 24"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <circle cx="13" cy="12" r="9" fill="#EB001B" />
      <circle cx="23" cy="12" r="9" fill="#F79E1B" />
    </svg>
  );
}

export function VisaMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  return (
    <span
      className={cn(
        "font-serif font-extrabold italic tracking-wide text-[#1A1F71]",
        size === "sm" ? "text-xs" : "text-lg",
        className,
      )}
    >
      VISA
    </span>
  );
}

export function AmexMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  return (
    <span
      className={cn(
        "flex items-center rounded-[2px] bg-[#2E77BC]",
        size === "sm" ? "h-5 px-1" : "h-7 px-1.5",
        className,
      )}
    >
      <span
        className={cn(
          "font-bold tracking-[0.05em] text-white",
          size === "sm" ? "text-[0.55rem]" : "text-[0.68rem]",
        )}
      >
        AMEX
      </span>
    </span>
  );
}

export function RupayMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  return (
    <span
      className={cn(
        "font-extrabold tracking-tight text-[#0F9D58]",
        size === "sm" ? "text-xs" : "text-lg",
        className,
      )}
    >
      RuPay
    </span>
  );
}

export function PaypalMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  return (
    <span
      className={cn(
        "font-bold italic tracking-tight text-[#003087]",
        size === "sm" ? "text-xs" : "text-lg",
        className,
      )}
    >
      PayPal
    </span>
  );
}

export function UpiMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: BrandMarkSize;
}) {
  return (
    <span
      className={cn("flex flex-col items-center leading-none", className)}
    >
      <span
        className={cn(
          "font-extrabold tracking-tight text-[#152B4C]",
          size === "sm" ? "text-[0.65rem]" : "text-[0.95rem]",
        )}
      >
        UPI
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex w-full overflow-hidden rounded-full",
          size === "sm" ? "mt-0.5 h-px" : "mt-1 h-[3px]",
        )}
      >
        <span className="h-full w-1/3 bg-[#FF9933]" />
        <span className="h-full w-1/3 bg-[#138808]" />
        <span className="h-full w-1/3 bg-[#0070C0]" />
      </span>
    </span>
  );
}