'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { RocketLogo } from '@/components/ui/RocketLogo';

type HeroProps = {
  locale: string;
};

export function Hero({ locale }: HeroProps) {
  const content = {
    en: {
      badge: 'Georgian-first AI platform',
      titleStart: 'AI platform that',
      titleAccent: 'works for you',
      description: 'Create text, images, video, and automation in one workspace — fast and professional.',
      ctaPrimary: 'Get Started',
      ctaSecondary: 'How it works',
      highlights: ['Fully localized', 'Secure system', 'Built for business'],
    },
    ka: {
      badge: 'Georgian-first AI პლატფორმა',
      titleStart: 'AI პლატფორმა, რომელიც',
      titleAccent: 'მუშაობს შენთვის',
      description: 'შექმენი ტექსტი, სურათი, ვიდეო და ავტომატიზაცია ერთ სივრცეში — სწრაფად და პროფესიონალურად.',
      ctaPrimary: 'დაწყება',
      ctaSecondary: 'როგორ მუშაობს',
      highlights: ['სრულად ქართულად', 'უსაფრთხო სისტემა', 'ბიზნესებისთვის მზად'],
    },
    ru: {
      badge: 'AI-платформа с поддержкой грузинского',
      titleStart: 'AI-платформа, которая',
      titleAccent: 'работает за вас',
      description: 'Создавайте текст, изображения, видео и автоматизации в одном пространстве — быстро и профессионально.',
      ctaPrimary: 'Начать',
      ctaSecondary: 'Как это работает',
      highlights: ['Полная локализация', 'Безопасная система', 'Готово для бизнеса'],
    },
  };

  const text = content[locale as 'en' | 'ka' | 'ru'] ?? content.ka;

  return (
    <section className="relative px-4 pb-20 pt-28">
      {/* Route sanity check: edit this shared hero for /en, /ka, and /ru (root / redirects to default locale). */}
      <div className="mx-auto max-w-6xl text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <RocketLogo size="md" animated glow />
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm text-cyan-200">
            {text.badge}
          </span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-4xl text-4xl font-bold leading-tight text-white md:text-6xl"
        >
          {text.titleStart}{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-cyan-300 bg-[length:200%_200%] bg-clip-text text-transparent animate-pulse">
            {text.titleAccent}
          </span>
        </motion.h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-300 md:text-xl">
          {text.description}
        </p>

        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href={`/${locale}/workspace`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-4 font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.02]"
          >
            {text.ctaPrimary}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/${locale}/services`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 font-semibold text-white transition hover:bg-white/10"
          >
            {text.ctaSecondary}
            <PlayCircle className="h-4 w-4" />
          </Link>
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
          {text.highlights.map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
