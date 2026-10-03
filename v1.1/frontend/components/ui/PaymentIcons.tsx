import { FaCcMastercard, FaCcVisa, FaPaypal } from "react-icons/fa6";

import { cn } from "@/lib/utils";

/*
 * Payment method marks for the footer.
 *
 * RuPay and UPI are rendered as typographic chips rather than hand-drawn SVG
 * logos — guessing at a payment network's trademark artwork is both inaccurate
 * and a brand-usage risk. Swap in official assets if licensed ones are supplied.
 */

type PaymentKey = "visa" | "mastercard" | "rupay" | "upi" | "paypal";

/** Shared chrome: uniform box, so the row reads as one set. */
const chip =
  "inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-md border border-line bg-bg-elevated px-2.5";

export function PaymentIcon({ name }: { name: string }) {
  const key = name as PaymentKey;

  switch (key) {
    case "visa":
      return (
        <span className={chip} title="Visa">
          <FaCcVisa className="size-5 text-[1a1f71]" aria-hidden="true" />
          <span className="sr-only">Visa</span>
        </span>
      );
    case "mastercard":
      return (
        <span className={chip} title="Mastercard">
          <FaCcMastercard className="size-5 text-[#eb001b]" aria-hidden="true" />
          <span className="sr-only">Mastercard</span>
        </span>
      );
    case "paypal":
      return (
        <span className={chip} title="PayPal">
          <FaPaypal className="size-5 text-[#003087]" aria-hidden="true" />
          <span className="sr-only">PayPal</span>
        </span>
      );
    case "rupay":
      return (
        <span className={cn(chip, "font-display text-[0.6875rem] font-bold tracking-tight text-ink")}>
          <span aria-hidden="true">RuPay</span>
          <span className="sr-only">RuPay</span>
        </span>
      );
    case "upi":
      return (
        <span className={cn(chip, "font-display text-[0.6875rem] font-bold tracking-tight text-ink")}>
          <span aria-hidden="true">UPI</span>
          <span className="sr-only">UPI</span>
        </span>
      );
    default:
      return null;
  }
}

/** The full "Payments we accept" row. */
export function PaymentRow({
  methods,
  className,
}: {
  methods: ReadonlyArray<{ key: string; label: string }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {methods.map((method) => (
        <li key={method.key}>
          <PaymentIcon name={method.key} />
        </li>
      ))}
    </ul>
  );
}
