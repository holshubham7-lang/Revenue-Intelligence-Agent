import { Check } from "lucide-react";

import { Logo } from "@/components/ui/Logo";
import { signup, type BrandPanelContent } from "@/lib/content";

/**
 * Left half of the split-screen auth layout (sign-up and sign-in).
 *
 * Pinned to a LIGHT surface with fixed values rather than theme tokens, and
 * deliberately so: the brand mark is a green gradient (near-black-green through
 * to near-white-green), so it needs a light backing to keep its contrast — on
 * the previous deep-green band it was green-on-green and effectively invisible.
 * Fixed values also mean the panel grades the same in dark mode, where the
 * theme's ink/brand tokens would flip and swallow the mark again.
 *
 * Hidden below `lg`; the form column carries a compact brand header on small
 * screens instead.
 */
export function BrandPanel({ panel = signup.panel }: { panel?: BrandPanelContent }) {
  return (
    <aside className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#f8fbf9_0%,#eef4f0_48%,#e2ece6_100%)] p-10 lg:flex lg:p-14">
      {/* Decorative sweeps — matching the CTA band, retuned for a light surface */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-20 size-96 rounded-full bg-[#34744e]/10 blur-3xl" />
        <div className="absolute -right-24 bottom-24 size-[26rem] rounded-full bg-[#d97706]/10 blur-3xl" />
      </div>

      <div className="relative">
        <Logo tone="light" />
      </div>

      <div className="relative">
        <h1 className="font-display text-3xl leading-[1.18] font-bold text-[#0f172a] sm:text-[2.5rem]">
          {panel.headline}
        </h1>

        <ul className="mt-8 space-y-3.5">
          {panel.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#34744e]/15 text-[#2a5f3e]">
                <Check className="size-3" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="text-[0.9375rem] leading-relaxed text-[#334155]">
                {benefit}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Floating stat card */}
      <div className="relative max-w-xs">
        <div className="rounded-tile border border-[#34744e]/15 bg-white/80 p-5 shadow-sm backdrop-blur-md">
          <p className="font-mono text-xs tracking-[0.12em] text-[#34744e] uppercase">
            {panel.stat.label}
          </p>
          <p className="mt-1 font-display text-4xl font-bold text-[#0f172a]">
            {panel.stat.value}
          </p>
          <p className="mt-1 text-sm text-[#475569]">{panel.stat.caption}</p>
        </div>
      </div>
    </aside>
  );
}
