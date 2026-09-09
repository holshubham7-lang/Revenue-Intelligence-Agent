import type { Metadata } from "next";
import { SITE } from "@/lib/constants";

export const DEFAULT_METADATA: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.product} | ${SITE.tagline}`,
    template: `%s | ${SITE.product}`,
  },
  description: SITE.metaDescription,
  applicationName: SITE.name,
  keywords: [
    "Revenue Intelligence",
    "RevOps",
    "Revenue Operations",
    "revenue leakage",
    "business intelligence",
    "revenue optimization",
    "business analysis",
    "sales performance",
    "marketing performance",
    "operational performance",
    "revenue opportunities",
    "business decision-making",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `${SITE.product} | ${SITE.tagline}`,
    description: SITE.metaDescription,
    url: SITE.url,
    siteName: SITE.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.product} | ${SITE.tagline}`,
    description: SITE.metaDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/** Builds page metadata with correct title + canonical for a given path. */
export function buildPageMetadata(path: string, extra?: Metadata): Metadata {
  return {
    ...DEFAULT_METADATA,
    ...extra,
    alternates: { canonical: path },
  };
}