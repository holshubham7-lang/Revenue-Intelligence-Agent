import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";

/**
 * Redirected to `/chat`.
 *
 * Uploading a report used to be a step of its own between company registration
 * and the assistant, and it was reachable from the navigation as "Data sources".
 * The files the user shares now live in a panel beside the conversation, so a
 * separate page for them would be a second place to look for the same thing and
 * a step the user has to be routed through for no gain.
 *
 * Kept as a route rather than deleted because links to it already exist in
 * saved conversations, bookmarks, and the sign-in return-to allowlist in
 * `lib/auth/oauth.ts`. Redirecting turns those into the chat instead of a 404.
 *
 * Session validity includes the block-status and revocation checks in
 * `resolveSessionUser`, and the destination is the same one `lib/onboarding.ts`
 * now resolves every post-registration stage to.
 */
export default async function DataSourcesPage() {
  const cookieStore = await cookies();
  const user = await resolveSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/signin");

  redirect("/chat");
}