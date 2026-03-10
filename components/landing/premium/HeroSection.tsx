'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    greeting: 'Your AI Workspace',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Create avatars, videos, images, music, and media — all in one intelligent platform.',
  },
  ka: {
    greeting: 'თქვენი AI სამუშაო სივრცე',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'შექმენით ავატარები, ვიდეო, სურათები, მუსიკა და მედია — ერთ ინტელექტუალურ პლატფორმაზე.',
  },
  ru: {
    greeting: 'Ваше AI-пространство',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Создавайте аватары, видео, изображения, музыку и медиа — на одной интеллектуальной платформе.',
  },
} as const

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en

  return (
    <section className="flex flex-col items-center justify-center text-center px-6 pt-20 pb-6 sm:pt-28 sm:pb-10 lg:pt-32 lg:pb-12">
      {/* Centered 3D avatar placeholder */}
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl mb-6 sm:mb-8 flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, var(--color-accent), rgba(99,102,241,0.6))',
          boxShadow: '0 8px 32px rgba(99,102,241,0.25)',
        }}
      >
        <span className="text-3xl sm:text-4xl text-white font-bold">G</span>
      </div>

      {/* Badge */}
      <p
        className="text-[11px] sm:text-xs tracking-[0.2em] uppercase font-medium mb-4 sm:mb-5"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {c.greeting}
      </p>

      {/* Brand name */}
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]" style={{ color: 'var(--color-text)' }}>
        {c.brand}
        <span style={{ color: 'var(--color-accent)', opacity: 0.6 }}>{c.brandDot}</span>
      </h1>

      {/* Tagline */}
      <p
        className="mt-4 sm:mt-5 text-[15px] sm:text-base lg:text-lg max-w-lg lg:max-w-xl leading-relaxed font-normal"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {c.tagline}
      </p>
    </section>
  )
}
