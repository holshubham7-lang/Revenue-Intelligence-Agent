import type { Metadata } from "next";
import { ConnectedApps } from "@/components/dashboard/ConnectedApps";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard/connected-apps", {
  title: "Connected Apps",
  robots: { index: false, follow: false },
});

export default function ConnectedAppsPage() {
  return <ConnectedApps />;
}