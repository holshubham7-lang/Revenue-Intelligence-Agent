import type { Metadata } from "next";
import { WhatChanged } from "@/components/dashboard/WhatChanged";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata(
  "/dashboard/connected-apps",
  {
    title: "What Changed",
    robots: { index: false, follow: false },
  },
);

export default async function ConnectionPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  return <WhatChanged connectionId={connectionId} />;
}