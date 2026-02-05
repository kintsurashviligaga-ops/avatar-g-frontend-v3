import { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import FeaturesSection from "@/components/sections/FeaturesSection";
import ServicesSection from "@/components/sections/ServicesSection";
import IdentitySection from "@/components/sections/IdentitySection";
import CTASection from "@/components/sections/CTASection";

export const metadata: Metadata = {
  title: "Avatar G - Digital Twin Protocol",
  description: "Create your AI-powered digital twin. Voice cloning, avatar generation, and intelligent media production.",
  openGraph: {
    title: "Avatar G - Digital Twin Protocol",
    description: "Your AI-powered digital identity",
    images: ["/og-image.png"],
  },
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#05070A] text-white overflow-hidden">
      <HeroSection />
      <FeaturesSection />
      <ServicesSection />
      <IdentitySection />
      <CTASection />
    </main>
  );
}
