"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ErrorBoundary from "@/components/landing/ErrorBoundary";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const HeroSection = dynamic(() => import("@/components/HeroSection").then((m) => m.HeroSection), {
  ssr: true,
  loading: () => <SectionFallback label="Hero" />,
});

const StatsSection = dynamic(() => import("@/components/landing/StatsSection").then((m) => m.StatsSection), {
  ssr: true,
  loading: () => <SectionFallback label="Stats" />,
});

const OrbitSolarSystem = dynamic(() => import("@/components/OrbitSolarSystem").then((m) => m.OrbitSolarSystem), {
  ssr: false,
  loading: () => <SectionFallback label="Orbit" />,
});

const FeaturesShowcase = dynamic(() => import("@/components/landing/FeaturesShowcase").then((m) => m.FeaturesShowcase), {
  ssr: true,
  loading: () => <SectionFallback label="Features" />,
});

const WorkflowCinematicSection = dynamic(() => import("@/components/WorkflowCinematicSection").then((m) => m.WorkflowCinematicSection), {
  ssr: true,
  loading: () => <SectionFallback label="Cinematic" />,
});

const LiveAvatarDemoSection = dynamic(() => import("@/components/landing/LiveAvatarDemoSection").then((m) => m.LiveAvatarDemoSection), {
  ssr: true,
  loading: () => <SectionFallback label="Avatar Demo" />,
});

const PricingSection = dynamic(() => import("@/components/PricingSection").then((m) => m.PricingSection), {
  ssr: true,
  loading: () => <SectionFallback label="Pricing" />,
});

const CTABanner = dynamic(() => import("@/components/landing/CTABanner").then((m) => m.CTABanner), {
  ssr: true,
  loading: () => <SectionFallback label="CTA" />,
});

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
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 md:py-16 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-10 backdrop-blur-sm">
        <p className="text-cyan-100/50 text-xs uppercase tracking-[0.18em]">{label}</p>
      </div>
    </div>
  );
}

function LandingSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative ag-slide-up py-1 md:py-2" style={{ contentVisibility: "auto", containIntrinsicSize: "1px 860px" }}>
      {children}
    </section>
  );
}

export default function LandingPageClient() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);
  const [enableHeavyFx, setEnableHeavyFx] = useState(false);
  const { language: locale } = useLanguage();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const screenMedia = window.matchMedia("(min-width: 768px)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncEffects = () => {
      setEnableHeavyFx(screenMedia.matches && !motionMedia.matches);
    };

    syncEffects();
    screenMedia.addEventListener("change", syncEffects);
    motionMedia.addEventListener("change", syncEffects);
    return () => {
      screenMedia.removeEventListener("change", syncEffects);
      motionMedia.removeEventListener("change", syncEffects);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-transparent text-white overflow-hidden ag-noise ag-neon-grid-lines">
      {enableHeavyFx && <CosmicSingularityBackground />}

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
        <div className="absolute top-[-110px] left-1/2 -translate-x-1/2 w-[680px] h-[340px] sm:w-[900px] sm:h-[450px] bg-cyan-500/[0.08] sm:bg-cyan-500/[0.1] blur-[80px] sm:blur-[120px] rounded-full" />
        <div className="hidden sm:block absolute bottom-[20%] right-[-80px] w-[380px] h-[380px] bg-violet-500/[0.1] blur-[120px] rounded-full" />
        <div className="hidden md:block absolute left-[-60px] top-[35%] w-[280px] h-[280px] rounded-full bg-blue-500/[0.09] blur-[120px]" />
      </div>

      {/* Neon contour rails */}
      <div className="pointer-events-none absolute inset-0 z-[2] opacity-75">
        <div className="absolute inset-y-0 left-[6%] w-px bg-gradient-to-b from-transparent via-white/35 to-transparent" />
        <div className="absolute inset-y-0 right-[6%] w-px bg-gradient-to-b from-transparent via-white/35 to-transparent" />
        <div className="absolute top-[14%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
            <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
          </ErrorBoundary>
        </LandingSection>

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
            <StatsSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
            <section className="relative pb-10 md:pb-14 px-4 sm:px-6">
              <div className="mx-auto max-w-4xl text-center pt-10 md:pt-14">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/72">Interactive AI Ecosystem</p>
                <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight text-white ag-lux-type-h">AI System Orbit</h2>
                <p className="mt-3 text-sm md:text-base ag-lux-type-body">Core AI center with connected module nodes, live hover detail, and service entry points.</p>
              </div>
              <OrbitSolarSystem />
            </section>
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Features" />}>
            <FeaturesShowcase />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Cinematic" />}>
            <WorkflowCinematicSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Avatar Demo" />}>
            <LiveAvatarDemoSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
            <PricingSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="CTA" />}>
            <CTABanner />
          </ErrorBoundary>
        </LandingSection>

        {/* ═══ Footer ═══ */}
        <footer className="relative mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 md:py-16 rounded-t-3xl bg-[linear-gradient(140deg,rgba(8,14,30,0.78),rgba(5,10,24,0.66))] backdrop-blur-[18px] shadow-[0_14px_46px_rgba(0,0,0,0.42)] ag-lux-outline-30">
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
