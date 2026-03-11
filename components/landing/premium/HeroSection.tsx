'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'

const COPY = {
  en: {
    badge: '16 AI Services — One Workspace',
    headline: 'Create anything with',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Avatars, videos, images, music, marketing content, and business intelligence — powered by multi-modal AI, in a single premium platform.',
    cta: 'Start Creating',
    ctaSecondary: 'Explore Services',
  },
  ka: {
    badge: '16 AI სერვისი — ერთ სივრცეში',
    headline: 'შექმენი ყველაფერი',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'ავატარები, ვიდეო, სურათები, მუსიკა, მარკეტინგული კონტენტი და ბიზნეს ინტელექტი — მულტი-მოდალური AI-ით, ერთ პრემიუმ პლატფორმაზე.',
    cta: 'შექმნის დაწყება',
    ctaSecondary: 'სერვისების ნახვა',
  },
  ru: {
    badge: '16 AI-сервисов — одно пространство',
    headline: 'Создавайте всё с',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Аватары, видео, изображения, музыка, маркетинговый контент и бизнес-аналитика — на базе мультимодального AI, в одной премиум-платформе.',
    cta: 'Начать создание',
    ctaSecondary: 'Все сервисы',
  },
} as const

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative flex flex-col items-center justify-center text-center px-6 pt-20 pb-8 sm:pt-28 sm:pb-12 lg:pt-32 lg:pb-16 overflow-hidden">
      {/* Ambient glow — subtle radial gradient behind the hero */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] sm:w-[800px] sm:h-[500px] opacity-30 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 50% 30%, var(--color-accent) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Logo */}
      <div className="relative z-10 mb-6 sm:mb-8">
        <BrandLogo size="lg" showText={false} />
      </div>

      {/* Badge */}
      <div
        className="relative z-10 inline-flex items-center gap-2 text-[11px] sm:text-xs tracking-[0.15em] uppercase font-medium mb-5 sm:mb-6 px-4 py-1.5 rounded-full"
        style={{
          color: 'var(--color-accent)',
          backgroundColor: 'var(--color-accent-soft)',
          border: '1px solid var(--color-accent)',
          borderColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)',
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
        {c.badge}
      </div>

      {/* Headline */}
      <h1 className="relative z-10 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.08]" style={{ color: 'var(--color-text)' }}>
        {c.headline}
        <br className="sm:hidden" />
        <span className="sm:ml-3">
          {c.brand}
          <span style={{ color: 'var(--color-accent)', opacity: 0.7 }}>{c.brandDot}</span>
        </span>
      </h1>

      {/* Tagline */}
      <p
        className="relative z-10 mt-5 sm:mt-6 text-[15px] sm:text-base lg:text-lg max-w-lg lg:max-w-2xl leading-relaxed font-normal"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {c.tagline}
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 mt-8 sm:mt-10">
        <a
          href={lh('/signup')}
          className="inline-flex items-center gap-2 text-[14px] font-semibold px-7 py-3 rounded-full transition-all duration-200 active:scale-[0.97] hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {c.cta}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
        <a
          href={lh('/services')}
          className="inline-flex items-center gap-2 text-[14px] font-medium px-6 py-3 rounded-full transition-all duration-200 hover:opacity-80"
          style={{
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {c.ctaSecondary}
        </a>
      </div>
    </section>
  )
}
