import type { Metadata } from "next";
import { CompanyDetails } from "@/components/dashboard/CompanyDetails";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata("/dashboard/company", {
  title: "Company details",
  robots: { index: false, follow: false },
});

export default function CompanyPage() {
  return <CompanyDetails />;
}
