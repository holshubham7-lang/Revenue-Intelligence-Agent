import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AccountSettings, type AccountSettingsData } from "@/components/account/AccountSettings";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resolveSessionUser } from "@/lib/auth/user";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: company.account.meta.title,
  description: company.account.meta.description,
  /* Nothing here should ever be indexed: it is behind a session, and a search
     result for "account settings" is a dead end for anyone who clicks it. */
  robots: { index: false, follow: false },
};

/**
 * Account settings — the person, not the company.
 *
 * This is the destination the header's account menu opens. It deliberately does
 * *not* edit the company record: `/company` owns that, and one "profile" screen
 * that mixed the two meant a user editing their name could not tell whether
 * they were changing what the assistant calls them or what their business is
 * called.
 *
 * The document is read here rather than in the client so the form arrives with
 * real values — there is no loading state to get wrong, and nothing about this
 * account is exposed before the session check above has passed. The layout
 * already redirects unauthenticated visitors, so `user` is always present.
 */
export default async function AccountPage() {
  const cookieStore = await cookies();
  const user = await resolveSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) return null;

  const data: AccountSettingsData = {
    name: user.name,
    email: user.email,
    profileImage: user.profileImage,
    /* The password form is a decision made here, not in the client: `authProvider`
       is server truth, and a social account has nothing for the form to change. */
    hasPassword: user.authProvider === "password" && Boolean(user.passwordHash),
    authProvider: user.authProvider,
    isEmailVerified: user.isEmailVerified,
    memberSince: formatDate(user.createdAt),
    linkedProviders: (user.identities ?? []).map((identity) => ({
      provider: identity.provider,
      linkedEmail: identity.linkedEmail,
      linkedAt: formatDate(identity.linkedAt),
    })),
  };

  return <AccountSettings initial={data} />;
}

/**
 * `14 March 2026`, in UTC.
 *
 * UTC deliberately: the same code renders on the server and again in the
 * browser during hydration, and a viewer west of Greenwich would otherwise be
 * handed a different day than the server wrote — which React reports as a
 * hydration mismatch and the user sees as a date that changed on its own.
 */
function formatDate(value: string | undefined): string {
  if (!value) return company.account.details.unknownDateLabel;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return company.account.details.unknownDateLabel;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}