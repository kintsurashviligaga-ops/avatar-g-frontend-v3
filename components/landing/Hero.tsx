'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { PlayCircle } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

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
    <section className="relative px-4 pb-20 pt-28 md:pb-24 md:pt-40">
      <div className="mx-auto max-w-[92vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl text-center">
        <div className="mb-8 flex items-center justify-center gap-4">
          <Logo variant="icon" size="lg" href={`/${locale}`} className="pointer-events-none" />
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-6 py-2 text-base md:text-lg text-cyan-200 font-semibold tracking-wide">
            {text.badge}
          </span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-2xl sm:max-w-3xl md:max-w-4xl text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight md:leading-[1.1] text-white tracking-tight"
        >
          <span className="block text-gradient bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent">
            {text.titleStart}
          </span>
          <span className="block mt-3 text-gradient bg-gradient-to-r from-indigo-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
            {text.titleAccent}
          </span>
        </motion.h1>

        <p className="mx-auto mt-8 max-w-xl text-base sm:text-lg md:text-2xl text-gray-300 font-medium">
          {text.description}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5">
          <Link href={`/${locale}/signup`}>
            <button className="ag-btn-primary px-10 py-4 text-lg md:text-xl rounded-2xl font-bold shadow-xl focus-visible:ring-2 focus-visible:ring-cyan-400/70">
              {text.ctaPrimary}
            </button>
          </Link>
          <Link href={`#how`} className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10 focus-visible:ring-2 focus-visible:ring-cyan-400/70 text-lg md:text-xl font-semibold">
            <PlayCircle className="w-6 h-6" />
            {text.ctaSecondary}
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-3 sm:gap-5">
          {text.highlights.map((h, i) => (
            <span key={i} className="inline-block rounded-full bg-white/10 border border-cyan-400/20 px-6 py-2 text-base md:text-lg text-cyan-100 font-medium backdrop-blur-md">
              {h}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
