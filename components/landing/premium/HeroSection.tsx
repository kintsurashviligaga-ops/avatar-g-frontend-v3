'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    greeting: 'Welcome to',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Your all-in-one AI workspace for avatars, video, images, music, and media production.',
  },
  ka: {
    greeting: 'კეთილი იყოს თქვენი მობრძანება',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'AI სამუშაო სივრცე ავატარების, ვიდეო, სურათების, მუსიკისა და მედია წარმოებისთვის.',
  },
  ru: {
    greeting: 'Добро пожаловать в',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Универсальное AI-пространство для аватаров, видео, изображений, музыки и медиа.',
  },
} as const

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en

  return (
    <section className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-8 sm:pt-32 sm:pb-12 lg:pt-40 lg:pb-16 animate-[fadeIn_0.8s_ease-out]">
      {/* Subtle ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02),transparent_70%)] pointer-events-none" />

      {/* Greeting */}
      <p className="text-[13px] sm:text-sm tracking-[0.2em] uppercase text-white/20 font-medium mb-6 sm:mb-8">
        {c.greeting}
      </p>

      {/* Brand name */}
      <h1 className="text-[2.75rem] sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
        <span className="text-white">{c.brand}</span>
        <span className="text-white/25">{c.brandDot}</span>
      </h1>

      {/* Tagline */}
      <p className="mt-5 sm:mt-7 text-[15px] sm:text-base lg:text-lg text-white/30 max-w-md lg:max-w-xl leading-relaxed font-light">
        {c.tagline}
      </p>
    </section>
  )
}
