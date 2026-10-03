import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { WhatYouGet } from "@/components/WhatYouGet";

/**
 * Public home page. A Server Component that only composes sections — all the
 * copy lives in `lib/content.ts` and the only client components in the tree are
 * the ones that genuinely need state (header menu, theme toggle, reveals).
 */
export default function HomePage() {
  return (
    <>
      <Header />

      <main id="main-content" className="flex-1">
        <Hero />
        <WhatYouGet />
        <HowItWorks />
        <CTASection />
      </main>

      <Footer />
    </>
  );
}
