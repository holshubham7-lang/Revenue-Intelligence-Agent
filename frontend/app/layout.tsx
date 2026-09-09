import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { DEFAULT_METADATA } from "@/lib/metadata";
import { SITE } from "@/lib/constants";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ToastViewport } from "@/components/ui/Toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = DEFAULT_METADATA;

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    brand: SITE.product,
    description: SITE.metaDescription,
    knowsAbout: ["Revenue Intelligence", "Revenue Operations", "RevOps"],
  };

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-surface text-ink">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ToastProvider>
          <div className="flex flex-1 flex-col">{children}</div>
          <ToastViewport />
        </ToastProvider>
      </body>
    </html>
  );
}