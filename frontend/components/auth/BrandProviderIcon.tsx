import type { SVGProps } from "react";

type BrandProviderIconProps = SVGProps<SVGSVGElement> & {
  provider: "google" | "microsoft" | "linkedin";
  size?: number;
};

export function BrandProviderIcon({
  provider,
  size = 20,
  className,
  ...props
}: BrandProviderIconProps) {
  if (provider === "google") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        aria-hidden="true"
        {...props}
      >
        <path
          fill="#EA4335"
          d="M12 4.6c1.7 0 3.2.6 4.4 1.8l3.3-3.3C17.6 1.1 15 0 12 0 7.3 0 3.2 2.6 1.2 6.5l3.9 3c.9-2.7 3.4-4.9 6.9-4.9Z"
        />
        <path
          fill="#4285F4"
          d="M23.6 12.2c0-.8-.1-1.6-.2-2.4H12v4.6h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
        />
        <path
          fill="#FBBC04"
          d="M5.1 14.5a7 7 0 0 1 0-5l-3.9-3a11.8 11.8 0 0 0 0 11l3.9-3Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.8-2.5 1.2-4 1.2-3.5 0-6-2.2-6.9-4.9l-3.9 3C3.2 21.4 7.3 24 12 24Z"
        />
      </svg>
    );
  }

  if (provider === "microsoft") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        aria-hidden="true"
        {...props}
      >
        <rect x="2" y="2" width="9.4" height="9.4" rx="1" fill="#F25022" />
        <rect x="12.6" y="2" width="9.4" height="9.4" rx="1" fill="#7FBA00" />
        <rect x="2" y="12.6" width="9.4" height="9.4" rx="1" fill="#00A4EF" />
        <rect x="12.6" y="12.6" width="9.4" height="9.4" rx="1" fill="#FFB900" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        fill="#0A66C2"
        d="M20.4 20.4h-3.6v-5.6c0-1.3 0-3-1.9-3-1.9 0-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6h.1c.4-.8 1.5-1.9 3.1-1.9 3.3 0 3.9 2.1 3.9 4.9v6.4v.4ZM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM7.1 20.4H3.5V9h3.6v11.4ZM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7c0-.9-.8-1.7-1.8-1.7Z"
      />
    </svg>
  );
}