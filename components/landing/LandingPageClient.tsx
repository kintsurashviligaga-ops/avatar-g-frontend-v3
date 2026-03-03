"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { HeroSection } from "@/components/HeroSection";
import { PricingSection } from "@/components/PricingSection";
import { WorkflowCinematicSection } from "@/components/WorkflowCinematicSection";
import { FeaturesShowcase } from "@/components/landing/FeaturesShowcase";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTABanner } from "@/components/landing/CTABanner";
import ErrorBoundary from "@/components/landing/ErrorBoundary";

const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

function SectionFallback({ label }: { label: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-gray-500 text-sm">[{label}] section loading failed.</p>
    </div>
  );
}

export default function LandingPageClient() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);

  return (
    <div className="relative min-h-screen bg-transparent text-white overflow-hidden">
      <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
        <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
        <StatsSection />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
        <section className="relative pb-12 px-4 sm:px-6">
          <OrbitSolarSystem />
        </section>
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Features" />}>
        <FeaturesShowcase />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
        <PricingSection />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Cinematic" />}>
        <WorkflowCinematicSection />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="CTA" />}>
        <CTABanner />
      </ErrorBoundary>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.06] py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <span className="text-sm text-gray-400">&copy; {new Date().getFullYear()} MyAvatar.ge</span>
          </div>
          <p className="text-[10px] text-gray-600 font-mono">
            {'BUILD ' + (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7) : 'dev') + ' | ' + (process.env.NEXT_PUBLIC_VERCEL_ENV || 'local')}
          </p>
        </div>
      </footer>

      <ErrorBoundary fallback={null}>
        <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
      </ErrorBoundary>
    </div>
  );
}
