import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard", {
  title: "Dashboard",
  robots: { index: false, follow: false },
});

export default function DashboardPage() {
  return <DashboardShell />;
}