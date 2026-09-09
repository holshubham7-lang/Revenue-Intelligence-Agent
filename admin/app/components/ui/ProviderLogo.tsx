export function ProviderLogo({
  provider,
  size = 16,
}: {
  provider: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (provider) {
    case "google":
      return (
        <svg {...common}>
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29c-.83 1.55-1.29 3.37-1.29 5.38s.46 3.83 1.29 5.38l3.98-3.09z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
          />
        </svg>
      );

    case "microsoft":
      return (
        <svg {...common}>
          <path fill="#F25022" d="M1.5 1.5h9v9h-9z" />
          <path fill="#7FBA00" d="M13.5 1.5h9v9h-9z" />
          <path fill="#00A4EF" d="M1.5 13.5h9v9h-9z" />
          <path fill="#FFB900" d="M13.5 13.5h9v9h-9z" />
        </svg>
      );

    case "linkedin":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="3.5" fill="#0A66C2" />
          <path
            fill="#fff"
            d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45z"
          />
        </svg>
      );

    default:
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m3.5 8 8.5 5.75L20.5 8" />
        </svg>
      );
  }
}