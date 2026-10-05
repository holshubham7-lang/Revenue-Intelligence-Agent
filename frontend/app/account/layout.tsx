import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CompanyShell } from "@/components/company/CompanyShell";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";

/**
 * Account settings layout — renders the authenticated shell around `/account`.
 *
 * Identical gating to `/company`, and for the same reason: this page is about
 * the signed-in person, and there is no meaningful version of it for a visitor.
 * Which means a user with no company record can still manage their account —
 * unlike the workspace routes, there is nothing here that needs a company.
 *
 * Session validity includes the block-status and revocation checks in
 * `resolveSessionUser`.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);

  if (!user) {
    redirect("/signin");
  }

  return (
    <CompanyShell user={{ name: user.name, email: user.email, profileImage: user.profileImage }}>
      {children}
    </CompanyShell>
  );
}