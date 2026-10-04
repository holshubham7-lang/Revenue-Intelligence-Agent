"use client";

import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaLinkedinIn } from "react-icons/fa6";

import { signup } from "@/lib/content";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Horizontal, light-theme social logins shown three across on a soft light
   panel. Each button keeps its brand's own mark in full colour and its brand
   tinted label, but every background stays light for a calm, uniform row.

   Google    — multicolour G + "Google" in brand blue #4285F4 (GSI outline look)
   Microsoft — four-colour squares + "Microsoft" in dark #2F2F2F (Entra light)
   LinkedIn  — blue "in" glyph #0A66C2 + "LinkedIn" in the same blue
   --------------------------------------------------------------------------- */

type ProviderKey = "google" | "microsoft" | "linkedin";

export type { ProviderKey };

type Props = {
  pendingProvider: ProviderKey | null;
  disabled: boolean;
  onContinue: (provider: ProviderKey) => void;
};

/** Official Microsoft logo — four-colour squares on 21×21. */
function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden="true">
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

const LOGOS: Record<ProviderKey, React.ReactElement> = {
  google: <FcGoogle className="size-5 shrink-0" aria-hidden="true" />,
  microsoft: <MicrosoftLogo className="size-[1.125rem] shrink-0" />,
  linkedin: (
    <FaLinkedinIn className="size-[1.0625rem] shrink-0 text-[#0a66c2]" aria-hidden="true" />
  ),
};

const STYLES: Record<ProviderKey, { label: string; hover: string }> = {
  google: {
    label: "text-black",
    hover: "hover:bg-[#f1f4f7]",
  },
  microsoft: {
    label: "text-black",
    hover: "hover:bg-[#f3f4f6]",
  },
  linkedin: {
    label: "text-black",
    hover: "hover:bg-[#eef4fb]",
  },
};

const BASE =
  "inline-flex size-14 cursor-pointer items-center justify-center rounded-full border border-[#e3e8e5] bg-white shadow-xs transition-colors duration-200 ease-out active:bg-[#eceeea] disabled:cursor-not-allowed disabled:opacity-60";

export function SocialButtons({ pendingProvider, disabled, onContinue }: Props) {
  return (
    <div className="rounded-card border border-[#e3e8e5] bg-[#f6f8f7] p-4 shadow-xs">
      <div className="flex items-start justify-center gap-8">
        {(Object.keys(LOGOS) as ProviderKey[]).map((key) => {
          const meta = signup.form.providers[key];
          const style = STYLES[key];
          const pending = pendingProvider === key;
          return (
            <div key={key} className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onContinue(key)}
                disabled={pendingProvider !== null || disabled}
                aria-label={meta.description}
                className={cn(BASE, style.hover)}
              >
                {pending ? (
                  <Loader2
                    className="size-5 shrink-0 animate-spin text-current opacity-80"
                    aria-hidden="true"
                  />
                ) : (
                  LOGOS[key]
                )}
              </button>
              <span className={cn("text-xs font-semibold", style.label)}>
                {meta.oauthName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}