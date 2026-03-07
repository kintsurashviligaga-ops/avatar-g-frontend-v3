"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { HeroSection } from "@/components/HeroSection";
import { PricingSection } from "@/components/PricingSection";
import { WorkflowCinematicSection } from "@/components/WorkflowCinematicSection";
import { FeaturesShowcase } from "@/components/landing/FeaturesShowcase";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTABanner } from "@/components/landing/CTABanner";
import { LiveAvatarDemoSection } from "@/components/landing/LiveAvatarDemoSection";
import ErrorBoundary from "@/components/landing/ErrorBoundary";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

const CosmicSingularityBackground = dynamic(() => import("@/components/CosmicSingularityBackground"), {
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
  const { language: locale } = useLanguage();

  return (
    <div className="relative min-h-screen bg-transparent text-white overflow-hidden ag-noise">
      <CosmicSingularityBackground />

      {/* Color Overlay — warm cinematic grade */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 980px 560px at 20% 14%, rgba(34,211,238,0.28), transparent 58%),' +
            'radial-gradient(ellipse 760px 430px at 84% 80%, rgba(124,92,252,0.24), transparent 52%),' +
            'linear-gradient(180deg, rgba(3,7,18,0.14) 0%, rgba(3,7,18,0.04) 50%, rgba(3,7,18,0.18) 100%)',
        }}
      />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(3,7,18,0.32)_100%)]" />

      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/[0.1] blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] right-[-80px] w-[380px] h-[380px] bg-violet-500/[0.1] blur-[120px] rounded-full" />
        <div className="absolute left-[-60px] top-[35%] w-[280px] h-[280px] rounded-full bg-blue-500/[0.09] blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
          <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
        </ErrorBoundary>

        <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
          <StatsSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-50 sm:opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
          <section className="relative pb-10 md:pb-14 px-4 sm:px-6">
            <div className="mx-auto max-w-4xl text-center pt-10 md:pt-14">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Interactive AI Ecosystem</p>
              <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight text-white">AI System Orbit</h2>
              <p className="mt-3 text-sm md:text-base text-white/60">Core AI center with connected module nodes, live hover detail, and service entry points.</p>
            </div>
            <OrbitSolarSystem />
          </section>
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-50 sm:opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Features" />}>
          <FeaturesShowcase />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-50 sm:opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Cinematic" />}>
          <WorkflowCinematicSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-50 sm:opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Avatar Demo" />}>
          <LiveAvatarDemoSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-50 sm:opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
          <PricingSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-50 sm:opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="CTA" />}>
          <CTABanner />
        </ErrorBoundary>

        {/* ═══ Footer ═══ */}
        <footer className="relative mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 md:py-16 rounded-t-3xl border-0 bg-[linear-gradient(140deg,rgba(8,14,30,0.78),rgba(5,10,24,0.66))] backdrop-blur-[18px] shadow-[0_14px_46px_rgba(0,0,0,0.42)]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8">
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-1">
                <BrandLogo href={`/${locale}`} size="sm20" showText />
                <p className="mt-4 text-sm text-white/35 leading-relaxed max-w-xs">
                  {locale === 'ka' ? 'AI-ზე დაფუძნებული შემოქმედებითი პლატფორმა. 16 მოდული, ერთი ინტელექტუალური სივრცე.' :
                   locale === 'ru' ? 'Креативная платформа на основе AI. 16 модулей, одно интеллектуальное пространство.' :
                   'AI-powered creative platform. 16 modules, one intelligent space.'}
                </p>
              </div>

              {/* Links columns */}
              <div>
                <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.2em] mb-4">
                  {locale === 'ka' ? 'პლატფორმა' : locale === 'ru' ? 'Платформа' : 'Platform'}
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: locale === 'ka' ? 'სერვისები' : locale === 'ru' ? 'Сервисы' : 'Services', href: `/${locale}/services` },
                    { label: locale === 'ka' ? 'ფასები' : locale === 'ru' ? 'Тарифы' : 'Pricing', href: `/${locale}/pricing` },
                    { label: locale === 'ka' ? 'ავატარ სტუდია' : locale === 'ru' ? 'Аватар-студия' : 'Avatar Studio', href: `/${locale}/services/avatar` },
                    { label: locale === 'ka' ? 'ვიდეო AI' : locale === 'ru' ? 'Видео AI' : 'Video AI', href: `/${locale}/services/video` },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-sm text-white/35 hover:text-white/70 transition-colors duration-200">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.2em] mb-4">
                  {locale === 'ka' ? 'კომპანია' : locale === 'ru' ? 'Компания' : 'Company'}
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: locale === 'ka' ? 'ჩვენს შესახებ' : locale === 'ru' ? 'О нас' : 'About', href: `/${locale}/about` },
                    { label: locale === 'ka' ? 'ბლოგი' : locale === 'ru' ? 'Блог' : 'Blog', href: `/${locale}/blog` },
                    { label: locale === 'ka' ? 'კარიერა' : locale === 'ru' ? 'Карьера' : 'Careers', href: `/${locale}/careers` },
                    { label: locale === 'ka' ? 'კონტაქტი' : locale === 'ru' ? 'Контакт' : 'Contact', href: `/${locale}/contact` },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-sm text-white/35 hover:text-white/70 transition-colors duration-200">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.2em] mb-4">
                  {locale === 'ka' ? 'იურიდიული' : locale === 'ru' ? 'Правовая информация' : 'Legal'}
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: locale === 'ka' ? 'კონფიდენციალურობა' : locale === 'ru' ? 'Конфиденциальность' : 'Privacy', href: `/${locale}/privacy` },
                    { label: locale === 'ka' ? 'პირობები' : locale === 'ru' ? 'Условия' : 'Terms', href: `/${locale}/terms` },
                    { label: 'Cookies', href: `/${locale}/cookies` },
                    { label: locale === 'ka' ? 'ლიცენზიები' : locale === 'ru' ? 'Лицензии' : 'Licenses', href: `/${locale}/licenses` },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-sm text-white/35 hover:text-white/70 transition-colors duration-200">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="mt-12 pt-6 border-t border-white/[0.10] flex flex-col md:flex-row items-center justify-between gap-3">
              <span className="text-xs text-white/25">
                &copy; {new Date().getFullYear()} MyAvatar.ge — {locale === 'ka' ? 'ყველა უფლება დაცულია.' : locale === 'ru' ? 'Все права защищены.' : 'All rights reserved.'}
              </span>
              <p className="text-[10px] text-white/15 font-mono tracking-wider">
                {'BUILD ' + (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7) : 'dev') + ' · ' + (process.env.NEXT_PUBLIC_VERCEL_ENV || 'local')}
              </p>
            </div>
          </div>
        </footer>
      </div>

      <ErrorBoundary fallback={null}>
        <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
      </ErrorBoundary>
    </div>
  );
}
