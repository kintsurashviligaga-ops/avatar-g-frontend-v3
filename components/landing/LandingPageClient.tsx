"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { HeroSection } from "@/components/HeroSection";
import { PricingSection } from "@/components/PricingSection";
import { FeaturesShowcase } from "@/components/landing/FeaturesShowcase";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTABanner } from "@/components/landing/CTABanner";
import ErrorBoundary from "@/components/landing/ErrorBoundary";

// Lazy load premium form for performance
const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

/**
 * Minimal fallback when a section crashes.
 * Shows nothing disruptive — the rest of the page continues rendering.
 */
function SectionFallback({ label }: { label: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-gray-500 text-sm">
        [{label}] ამ სექციის ჩატვირთვა ვერ მოხერხდა.
      </p>
    </div>
  );
}

export default function LandingPageClient() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#050510] text-white overflow-hidden">
      {/* ── Hero section ─────────────────────────────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
        <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
      </ErrorBoundary>

      {/* ── Stats bar — animated counters ────────────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
        <StatsSection />
      </ErrorBoundary>

      {/* ── Orbit Solar System — THE hero visual ────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
        <section className="relative pb-12 px-4 sm:px-6">
          <OrbitSolarSystem />
        </section>
      </ErrorBoundary>

      {/* ── Features Showcase — capabilities grid ────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Features" />}>
        <FeaturesShowcase />
      </ErrorBoundary>

      {/* ── Pricing Section ──────────────────────────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
        <PricingSection />
      </ErrorBoundary>

      {/* ── CTA Banner — final call to action ────────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="CTA" />}>
        <CTABanner />
      </ErrorBoundary>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="relative border-t border-white/[0.06] py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <span className="text-sm text-gray-400">© {new Date().getFullYear()} MyAvatar.ge — All rights reserved</span>
          </div>
          <p className="text-[10px] text-gray-600 font-mono">
            BUILD v3.3.0 | {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev'} | {new Date().toISOString().slice(0, 10)} | {process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'local'}
          </p>
        </div>
      </footer>

      <ErrorBoundary fallback={null}>
        <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
      </ErrorBoundary>
    </div>
  );
}
