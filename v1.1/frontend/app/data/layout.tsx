import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CompanyShell } from "@/components/company/CompanyShell";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";

/**
 * Data workspace layout — renders the authenticated shell around `/data`.
 *
 * Only the session is enforced here. A signed-in user without a company record
 * is deliberately NOT redirected: the route explains that reports attach to a
 * company and links to the step that supplies one. The gate itself lives in
 * `app/data/page.tsx`.
 *
 * Session validity includes the block-status and revocation checks in
 * `resolveSessionUser`.
 */
export default async function DataLayout({ children }: { children: React.ReactNode }) {
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
