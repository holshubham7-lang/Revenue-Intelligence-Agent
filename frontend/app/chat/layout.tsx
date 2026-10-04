import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ChatHistoryNav } from "@/components/chat/ChatHistoryNav";
import { CompanyShell } from "@/components/company/CompanyShell";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { findCompanyByUserId } from "@/lib/companies";
import type { ChatThreadEntry } from "@/lib/chat-events";
import { listChatThreads } from "@/lib/data/chat";

/**
 * Chat workspace layout — renders the authenticated shell around `/chat`.
 *
 * Only the session is enforced here. A signed-in user without a company record
 * is deliberately NOT redirected: this route explains what Chat needs and links
 * to the step that supplies it, which keeps the sidebar click from dumping the
 * user on a form with no explanation. The gate itself lives in `app/chat/page.tsx`.
 *
 * Session validity includes the block-status and revocation checks in
 * `resolveSessionUser`.
 *
 * The saved conversations are read here rather than in the page because they
 * belong in the navigation column, which this layout owns — and reading them in
 * the page would put them one level too deep to render outside the route content.
 */
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await resolveSessionUser(token);

  if (!user) {
    redirect("/signin");
  }

  const saved = await findCompanyByUserId(user._id);
  const threads: ChatThreadEntry[] = saved
    ? (await listChatThreads(saved._id)).map(({ id, title, updatedAt }) => ({
        id,
        title,
        updatedAt,
      }))
    : [];

  return (
    <CompanyShell
      user={{ name: user.name, email: user.email, profileImage: user.profileImage }}
      /* Chat keeps the transcript pinned above a fixed composer, so it scrolls a
         region of its own rather than letting `main` be the scroll region. Without
         the shell's padding that region reaches the window edge and its scrollbar
         sits exactly where every other page's does; its content brings its own
         padding and centring. */
      padded={false}
      chatHistory={<ChatHistoryNav initialThreads={threads} />}
    >
      {children}
    </CompanyShell>
  );
}
