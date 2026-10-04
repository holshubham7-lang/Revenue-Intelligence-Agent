import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { placeholderPages } from "@/lib/content";

const page = placeholderPages["terms"];

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: page.description,
};

export default function Page() {
  return <PlaceholderPage title={page.title} description={page.description} />;
}
