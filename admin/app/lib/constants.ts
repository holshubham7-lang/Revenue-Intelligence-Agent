export const API_URL: string =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:3020";

export const APP_NAME = "StratVeda Admin";
export const APP_PRODUCT = "Master Admin Panel";

export const PROVIDER_OPTIONS = [
  "email",
  "google",
  "microsoft",
  "linkedin",
] as const;
export type Provider = (typeof PROVIDER_OPTIONS)[number];