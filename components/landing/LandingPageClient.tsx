"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SERVICE_REGISTRY } from "@/lib/service-registry";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { HeroSection } from "@/components/HeroSection";
import { PricingSection } from "@/components/PricingSection";

// Lazy load premium form for performance
const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

const stats = [
  { value: "50K+", label: "Active Creators" },
  { value: "1M+", label: "Generations" },
  { value: "99.9%", label: "Uptime" },
];

export default function LandingPageClient() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);
  const enabledServices = SERVICE_REGISTRY.filter((s) => s.enabled);
  const serviceStats = [{ value: String(enabledServices.length), label: "Active Services" }, ...stats];

  return (
    <div className="relative min-h-screen bg-[#050510] text-white overflow-hidden">
      {/* ── Hero section ─────────────────────────────────────── */}
      <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />

      {/* ── Orbit Solar System — THE hero visual ────────────── */}
      <section className="relative pb-12 px-4 sm:px-6">
        <OrbitSolarSystem />
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section className="relative pb-20 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-white/10 pt-8">
          {serviceStats.map((stat) => (
            <div key={stat.label} className="text-center space-y-2">
              <div className="text-2xl md:text-3xl font-bold text-cyan-300">{stat.value}</div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing Section ──────────────────────────────────── */}
      <PricingSection />

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 text-center">
        <p className="text-sm text-gray-500">© {new Date().getFullYear()} MyAvatar.ge — All rights reserved</p>
      </footer>

      <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
    </div>
  );
}
