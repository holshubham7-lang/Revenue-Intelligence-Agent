import type { Metadata } from "next";
import { ActionPlanDetail } from "@/components/dashboard/ActionPlanDetail";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard/action-plans", {
  title: "Action Plan",
  robots: { index: false, follow: false },
});

export default async function ActionPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  return <ActionPlanDetail planId={planId} />;
}