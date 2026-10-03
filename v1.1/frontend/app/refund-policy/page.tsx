import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { placeholderPages } from "@/lib/content";

const page = placeholderPages["refund-policy"];

export const metadata: Metadata = {
  title: "Refund Policy",
  description: page.description,
};

export default function Page() {
  return <PlaceholderPage title={page.title} description={page.description} />;
}
