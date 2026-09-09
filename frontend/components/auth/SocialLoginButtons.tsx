"use client";

import type { ComponentPropsWithoutRef } from "react";
import { BrandProviderIcon } from "@/components/auth/BrandProviderIcon";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/constants";

type SocialProvider = "google" | "microsoft" | "linkedin";

const providers: {
  id: SocialProvider;
  name: string;
  description: string;
}[] = [
  { id: "google", name: "Google", description: "Workspace / Gmail" },
  { id: "microsoft", name: "Microsoft", description: "Entra ID / 365" },
  { id: "linkedin", name: "LinkedIn", description: "Professional network" },
];

type SocialLoginButtonsProps = ComponentPropsWithoutRef<"div"> & {
  onSelect?: (provider: SocialProvider) => void;
};

export function SocialLoginButtons({
  onSelect,
  className,
  ...props
}: SocialLoginButtonsProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-5",
        className,
      )}
      {...props}
    >
      {providers.map((provider) => (
        <div key={provider.id} className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            aria-label={`Continue with ${provider.name}`}
            title={`Continue with ${provider.name}`}
            onClick={() => {
              if (onSelect) {
                onSelect(provider.id);
                return;
              }
              // Send the browser to the backend OAuth authorize endpoint.
              // The backend redirects to the provider, then back to /dashboard.
              // Full-page navigation is required — the target is an external
              // cross-origin origin, so router.push() is not applicable.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = `${API_URL}/auth/social/${provider.id}`;
            }}
            className="flex size-14 cursor-pointer items-center justify-center rounded-full border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_6px_16px_-4px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.97]"
          >
            <BrandProviderIcon provider={provider.id} size={24} />
          </button>
          <span className="text-xs font-medium text-ink-faint">
            {provider.name}
          </span>
        </div>
      ))}
    </div>
  );
}
