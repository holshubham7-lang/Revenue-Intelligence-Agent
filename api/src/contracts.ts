/**
 * Shared type contracts between frontend (Next.js) and API (NestJS).
 *
 * Deliberately pure types with zero imports. These cross the client/server
 * boundary, so anything added here must not pull in `mongodb`, `node:crypto`,
 * or anything else that would bloat a client bundle or leak server internals.
 *
 * Keep this file in sync with `frontend/lib/contracts.ts`. It is duplicated
 * rather than imported across a package boundary because the frontend does not
 * depend on the API package, and adding that dependency for two type aliases
 * would make the deploy order of the two services significant.
 */

export type ProviderKey = "google" | "microsoft" | "linkedin";

/**
 * Flat, all-strings shape used to seed the client-side company form.
 * Stored `null`s collapse to `""` so a controlled input is never `null`.
 */
export type CompanyFormValues = {
  companyName: string;
  website: string;
  industry: string;
  companySize: string;
  companyType: string;
  country: string;
  state: string;
  city: string;
  phone: string;
  revenueRange: string;
  problem: string;
};
