import type { Metadata } from "next";
import { ActionPlans } from "@/components/dashboard/ActionPlans";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard/action-plans", {
  title: "Action Plans",
  robots: { index: false, follow: false },
});

export default function ActionPlansPage() {
  return <ActionPlans />;
}