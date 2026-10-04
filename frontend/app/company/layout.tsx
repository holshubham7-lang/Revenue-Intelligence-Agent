import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CompanyShell } from "@/components/company/CompanyShell";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";

/**
 * Company workspace layout — renders the authenticated shell (header, sidebar,
 * footer) around every `/company` route.
 *
 * Reads the `revops_session` cookie, resolves the signed-in user (signature,
 * account, block-status, and revocation are all checked), and passes it to the
 * shell so the header can greet them by name. No valid session? Off to the
 * sign-in page. Because it reads request-time cookies this layout (and the
 * routes under it) render dynamically.
 */
export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
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