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
import { BrandLogo } from "@/components/ui/BrandLogo";

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
      <div
        className="absolute inset-0 bg-cover bg-center opacity-62"
        style={{ backgroundImage: "url('/brand/background-main.svg')" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(34,211,238,0.24),transparent_44%),radial-gradient(circle_at_86%_84%,rgba(139,92,246,0.24),transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.62),rgba(2,6,23,0.36)_28%,rgba(2,6,23,0.56)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_52%,rgba(2,6,23,0.46)_100%)]" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-180px] left-1/2 -translate-x-1/2 w-[980px] h-[460px] bg-cyan-500/[0.06] blur-3xl rounded-full" />
        <div className="absolute bottom-[15%] right-[-120px] w-[420px] h-[420px] bg-violet-500/[0.08] blur-3xl rounded-full" />
      </div>

      <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
        <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
        <StatsSection />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
        <section className="relative pb-8 md:pb-12 px-4 sm:px-6">
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
            <BrandLogo href="/ka" size="sm" showText={false} />
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
