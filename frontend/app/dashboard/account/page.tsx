import type { Metadata } from "next";
import { AccountSettings } from "@/components/dashboard/AccountSettings";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard/account", {
  title: "Account settings",
  robots: { index: false, follow: false },
});

export default function AccountPage() {
  return <AccountSettings />;
}