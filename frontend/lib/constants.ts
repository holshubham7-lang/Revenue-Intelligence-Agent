export const SITE = {
  name: "StratVeda OS",
  product: "Revenue Intelligence Agent",
  url: "https://revops.stratvedatech.com" as string,
  corporateUrl: "https://www.stratvedatech.com" as string,
  tagline: "Revenue Intelligence for growing businesses",
  headline:
    "Discover Hidden Revenue Leaks Before They Cost You Growth",
  description:
    "Measure revenue impact, prioritize high-ROI opportunities, and know exactly where to act next.",
  metaDescription:
    "Discover hidden revenue leaks, measure business impact, and get a prioritized 30-day action plan with Revenue Intelligence Agent by StratVeda OS.",
} as const;

export const NAV = {
  signIn: { label: "Sign In", href: "/sign-in" },
  signUp: { label: "Sign Up", href: "/sign-up" },
} as const;

/** Legal links shown in the marketing footer. */
export const LEGAL = [
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Cookie Policy", href: "/legal/cookies" },
] as const;

/** Backend API base URL (NestJS). */
export const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3010";

/** Public frontend base URL used for post-logout redirect. */
export const APP_URL: string =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://revops-frontend-dev.azurewebsites.net";

/** Company size options for the company-setup flow. */
export const COMPANY_SIZE_OPTIONS = [
  "1–10 employees",
  "11–50 employees",
  "51–200 employees",
  "201–500 employees",
  "501–1,000 employees",
  "1,000+ employees",
] as const;

/** Annual revenue range options for the company-setup flow. */
export const REVENUE_RANGE_OPTIONS = [
  "Under $1M",
  "$1M – $10M",
  "$10M – $50M",
  "$50M+",
] as const;