import type { Metadata } from "next";
import { PluginsCatalog } from "@/components/dashboard/PluginsCatalog";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard/plugins", {
  title: "Plugins",
  robots: { index: false, follow: false },
});

export default function PluginsPage() {
  return <PluginsCatalog />;
}