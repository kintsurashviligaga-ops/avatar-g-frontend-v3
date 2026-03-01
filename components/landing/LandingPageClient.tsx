"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SERVICE_REGISTRY } from "@/lib/service-registry";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { HeroSection } from "@/components/HeroSection";
import { PricingSection } from "@/components/PricingSection";
import ErrorBoundary from "@/components/landing/ErrorBoundary";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  const { t } = useLanguage();
  const enabledServices = SERVICE_REGISTRY.filter((s) => s.enabled);
  const serviceStats = [
    { value: String(enabledServices.length), label: t('stats.services') },
    { value: "50K+", label: t('stats.creators') },
    { value: "1M+", label: t('stats.generations') },
    { value: "99.9%", label: t('stats.uptime') },
  ];

  return (
    <div className="relative min-h-screen bg-[#050510] text-white overflow-hidden">
      {/* ── Hero section ─────────────────────────────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
        <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
      </ErrorBoundary>

      {/* ── Orbit Solar System — THE hero visual ────────────── */}
      <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
        <section className="relative pb-12 px-4 sm:px-6">
          <OrbitSolarSystem />
        </section>
      </ErrorBoundary>

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
      <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
        <PricingSection />
      </ErrorBoundary>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 text-center space-y-2">
        <p className="text-sm text-gray-500">© {new Date().getFullYear()} MyAvatar.ge — All rights reserved</p>
        <p className="text-[10px] text-gray-600 font-mono">
          Build: {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.NEXT_PUBLIC_BUILD_ID?.slice(0, 7) || 'dev'} | {process.env.NEXT_PUBLIC_DEPLOYED_AT || new Date().toISOString().slice(0, 10)} | {process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'local'}
        </p>
      </footer>

      <ErrorBoundary fallback={null}>
        <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
      </ErrorBoundary>
    </div>
  );
}
