"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { OrbitSolarSystem } from "@/components/OrbitSolarSystem";
import { HeroSection } from "@/components/HeroSection";
import { PricingSection } from "@/components/PricingSection";
import { WorkflowCinematicSection } from "@/components/WorkflowCinematicSection";
import { FeaturesShowcase } from "@/components/landing/FeaturesShowcase";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTABanner } from "@/components/landing/CTABanner";
import ErrorBoundary from "@/components/landing/ErrorBoundary";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  const { language: locale } = useLanguage();
  const stars = useMemo(
    () =>
      Array.from({ length: 60 }, (_, index) => ({
        id: index,
        left: `${(index * 17) % 100}%`,
        top: `${(index * 29) % 100}%`,
        size: index % 9 === 0 ? 2.5 : index % 5 === 0 ? 1.5 : 1,
        opacity: index % 7 === 0 ? 0.7 : index % 3 === 0 ? 0.45 : 0.25,
        blur: index % 11 === 0 ? 0.8 : 0,
      })),
    []
  );
  const nebulaBands = useMemo(
    () => [
      {
        left: '2%',
        top: '5%',
        width: '42%',
        height: '35%',
        background:
          'radial-gradient(circle at 35% 35%, rgba(34,211,238,0.12), rgba(34,211,238,0.04) 30%, transparent 65%)',
      },
      {
        left: '55%',
        top: '10%',
        width: '38%',
        height: '30%',
        background:
          'radial-gradient(circle at 55% 45%, rgba(124,92,252,0.10), rgba(99,102,241,0.04) 32%, transparent 65%)',
      },
      {
        left: '15%',
        top: '55%',
        width: '48%',
        height: '32%',
        background:
          'radial-gradient(circle at 50% 50%, rgba(6,182,212,0.08), rgba(34,211,238,0.03) 28%, transparent 60%)',
      },
    ],
    []
  );

  return (
    <div className="relative min-h-screen bg-[#030712] text-white overflow-hidden ag-noise">
      {/* Background Image Layer */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <Image
          src="/brand/background-space.jpg?v=20260306c"
          alt="Space Background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center brightness-[1.22] contrast-[1.16] saturate-[1.22]"
          quality={90}
        />
      </div>

      {/* Color Overlay — warm cinematic grade */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 980px 560px at 20% 14%, rgba(34,211,238,0.2), transparent 58%),' +
            'radial-gradient(ellipse 760px 430px at 84% 80%, rgba(124,92,252,0.18), transparent 52%),' +
            'linear-gradient(180deg, rgba(3,7,18,0.28) 0%, rgba(3,7,18,0.10) 50%, rgba(3,7,18,0.36) 100%)',
        }}
      />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_46%,rgba(3,7,18,0.64)_100%)]" />

      {/* Nebula + Stars */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {nebulaBands.map((band, index) => (
          <div
            key={index}
            className="absolute rounded-full blur-3xl"
            style={{
              left: band.left,
              top: band.top,
              width: band.width,
              height: band.height,
              background: band.background,
            }}
          />
        ))}
        {stars.map((star) => (
          <span
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              filter: `blur(${star.blur}px)`,
              boxShadow: star.size > 2 ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
            }}
          />
        ))}

        {/* Subtle crossing lines */}
        <div className="absolute inset-x-[10%] top-[14%] h-px rotate-[6deg] bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
        <div className="absolute right-[15%] top-[28%] h-px w-[22%] -rotate-[10deg] bg-gradient-to-r from-transparent via-violet-300/20 to-transparent" />
      </div>

      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/[0.06] blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] right-[-80px] w-[350px] h-[350px] bg-violet-500/[0.06] blur-[120px] rounded-full" />
        <div className="absolute left-[-60px] top-[35%] w-[250px] h-[250px] rounded-full bg-blue-500/[0.05] blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
          <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
        </ErrorBoundary>

        <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
          <StatsSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
          <section className="relative pb-10 md:pb-14 px-4 sm:px-6">
            <OrbitSolarSystem />
          </section>
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Features" />}>
          <FeaturesShowcase />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
          <PricingSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="Cinematic" />}>
          <WorkflowCinematicSection />
        </ErrorBoundary>

        <div className="ag-divider-strong mx-auto max-w-6xl opacity-80" />

        <ErrorBoundary fallback={<SectionFallback label="CTA" />}>
          <CTABanner />
        </ErrorBoundary>

        {/* ═══ Footer ═══ */}
        <footer className="relative border-t border-white/[0.10] mt-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-400/[0.04] via-transparent to-transparent" />
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 md:py-16 ag-surface-secondary rounded-t-3xl border-x border-white/[0.08]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8">
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-1">
                <BrandLogo href={`/${locale}`} size="sm" showText />
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
