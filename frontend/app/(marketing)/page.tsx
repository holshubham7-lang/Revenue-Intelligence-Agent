import { Hero } from "@/components/marketing/Hero";
import { Features } from "@/components/marketing/Features";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CtaBand } from "@/components/marketing/CtaBand";

export default function Home() {
  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <Hero />
      <Features />
      <HowItWorks />
      <CtaBand />
    </main>
  );
}