import type { ReactNode } from "react";
import Link from "next/link";
import { LogoInverse } from "@/components/ui/Logo";
import {
  VisaMark,
  MastercardMark,
  AmexMark,
  RupayMark,
  UpiMark,
  PaypalMark,
} from "@/components/ui/BrandMarks";
import { SITE, NAV, LEGAL } from "@/lib/constants";

function PaymentBadge({ children }: { children: ReactNode }) {
  return (
    <li className="flex h-7 cursor-default select-none items-center gap-1.5 rounded-md border border-white/80 bg-white px-2.5 text-[#0F172A] shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
      {children}
    </li>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto bg-ink text-white">
      <div className="container-site pt-14 pb-7">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <LogoInverse />
            <p className="max-w-xs text-sm leading-relaxed text-white/60">
              {SITE.tagline}. Measure impact, prioritize the highest-ROI
              opportunities, and know exactly where to act next.
            </p>
          </div>

          <nav aria-label="Product">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
              Product
            </h2>
            <ul className="mt-4 space-y-3">
              {[NAV.signIn, NAV.signUp].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
              Legal
            </h2>
            <ul className="mt-4 space-y-3">
              {LEGAL.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
              We Accept
            </h2>
            <ul className="mt-4 grid grid-cols-3 gap-2">
              <PaymentBadge>
                <VisaMark size="sm" />
              </PaymentBadge>
              <PaymentBadge>
                <MastercardMark className="h-3 w-5" />
              </PaymentBadge>
              <PaymentBadge>
                <AmexMark size="sm" />
              </PaymentBadge>
              <PaymentBadge>
                <RupayMark size="sm" />
              </PaymentBadge>
              <PaymentBadge>
                <UpiMark size="sm" className="w-6" />
              </PaymentBadge>
              <PaymentBadge>
                <PaypalMark size="sm" />
              </PaymentBadge>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-site flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/60">
            Copyright &copy; {new Date().getFullYear()} StratVeda Technologies Pvt. Ltd. All rights reserved.
          </p>
          <p className="text-sm text-white/60">
            Design and Developed By{" "}
            <a
              href={SITE.corporateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white/90 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            >
              StratVeda Technologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}