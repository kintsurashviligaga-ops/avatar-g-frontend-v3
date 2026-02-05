"use client";

import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <HeroSection />
      <ServicesSection />
      <Footer />
    </main>
  );
}
