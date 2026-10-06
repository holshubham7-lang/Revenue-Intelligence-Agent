import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Roboto } from "next/font/google";

import { header, seo, site } from "@/lib/content";
import { ToastViewport } from "@/components/ui/Toast";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

/* --------------------------------------------------------------------------
   Typography — a two-stack system chosen for a fintech/analytics surface:
     Plus Jakarta Sans  headings + body — modern, professional, legible
     JetBrains Mono     data            — tabular figures for KPI/label text
   Both are self-hosted by next/font at build time: no request to Google
   at runtime, and `display: swap` + a tuned fallback keeps CLS at zero.
   -------------------------------------------------------------------------- */
const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Roboto Medium is the typeface mandated by Google's brand guidelines for the
// "Sign in with Google" button; loaded as a single weight just for that lockup.
const googleButton = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  display: "swap",
  weight: ["500"],
});

/**
 * Applies the saved theme before first paint.
 *
 * This must be a blocking, inline script in <head>: reading the value any
 * later would let the light theme paint first and then snap to dark, which is
 * exactly the flash-of-wrong-theme this avoids.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('ri-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: seo.title,
    template: `%s | ${site.name}`,
  },
  description: seo.description,
  keywords: [...seo.keywords],
  applicationName: site.name,
  authors: [{ name: site.legalName }],
  creator: site.legalName,
  publisher: site.legalName,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: seo.title,
    description: seo.description,
    locale: seo.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: seo.title,
    description: seo.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Next 16 only performs its scroll-behaviour override for SPA route
      // transitions when this attribute is present.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${googleButton.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-ink">
        <a href="#main-content" className="skip-link">
          {header.skipToContent}
        </a>
        {/* Toasts live at the root so a message survives the route change that
            follows it (sign-in → workspace, company → chat). */}
        <ToastProvider>
          {children}
          <ToastViewport />
        </ToastProvider>
      </body>
    </html>
  );
}
