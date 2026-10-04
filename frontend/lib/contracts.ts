/**
 * Shared type contracts between frontend (Next.js) and API (NestJS).
 *
 * Deliberately pure types with zero imports. These cross the client/server
 * boundary, so anything added here must not pull in `mongodb`, `node:crypto`,
 * or anything else that would bloat a client bundle or leak server internals.
 *
 * `CompanyFormValues` and `ProviderKey` were extracted out of `lib/companies.ts`
 * and `lib/auth/oauth.ts` respectively. Both client components imported a type
 * from a module that touches MongoDB or reads client secrets at module scope,
 * which dragged the whole server module into the client graph.
 *
 * Keep this file in sync with `api/src/contracts.ts`. It is duplicated rather
 * than imported across a package boundary because the frontend does not depend
 * on the API package, and adding that dependency for two type aliases would make
 * the deploy order of the two services significant.
 */

export type ProviderKey = "google" | "microsoft" | "linkedin";

/**
 * Flat, all-strings shape used to seed the client-side company form.
 * Stored `null`s collapse to `""` so a controlled input is never `null`.
 *
 * Field names mirror the real `CompanyFormValues` in `lib/companies.ts`, which
 * re-exports this type so there is a single definition of the shape.
 */
export type CompanyFormValues = {
  companyName: string;
  website: string;
  industry: string;
  companySize: string;
  country: string;
  revenueRange: string;
  problem: string;
};
