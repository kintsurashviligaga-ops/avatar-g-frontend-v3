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

/* Particle positions (pre-computed to avoid hydration mismatch) */
const PARTICLES = [
  { x: 12, y: 18, size: 2, delay: 0, dur: 6 },
  { x: 85, y: 25, size: 3, delay: 1.5, dur: 7 },
  { x: 35, y: 72, size: 2, delay: 0.8, dur: 5.5 },
  { x: 68, y: 15, size: 1.5, delay: 2.2, dur: 8 },
  { x: 92, y: 65, size: 2.5, delay: 0.3, dur: 6.5 },
  { x: 22, y: 48, size: 1.5, delay: 3, dur: 7.5 },
  { x: 78, y: 80, size: 2, delay: 1, dur: 5 },
  { x: 50, y: 10, size: 3, delay: 2.5, dur: 6 },
  { x: 8, y: 85, size: 1.5, delay: 0.5, dur: 7 },
  { x: 55, y: 55, size: 2, delay: 1.8, dur: 8 },
  { x: 42, y: 30, size: 1.5, delay: 3.5, dur: 6.5 },
  { x: 95, y: 45, size: 2, delay: 0.7, dur: 5.5 },
]

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative flex flex-col items-center justify-center text-center px-6 pt-24 pb-10 sm:pt-32 sm:pb-14 lg:pt-40 lg:pb-20 overflow-hidden">
      {/* === Cinematic ambient glow === */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] sm:w-[900px] sm:h-[600px] pointer-events-none animate-pulse-slow"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 50% 30%, rgba(99,102,241,0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      {/* Secondary violet glow */}
      <div
        className="absolute top-20 left-1/2 -translate-x-[60%] w-[400px] h-[300px] sm:w-[600px] sm:h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 40% 40%, rgba(139,92,246,0.1) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Cyan accent glow */}
      <div
        className="absolute top-32 right-[20%] w-[300px] h-[200px] sm:w-[400px] sm:h-[300px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 60% at 60% 50%, rgba(34,211,238,0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      {/* === Floating particles === */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-float-particle"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              left: `${p.x}%`,
              top: `${p.y}%`,
              background: i % 3 === 0
                ? 'rgba(99,102,241,0.5)'
                : i % 3 === 1
                  ? 'rgba(34,211,238,0.4)'
                  : 'rgba(139,92,246,0.45)',
              boxShadow: `0 0 ${p.size * 3}px ${i % 3 === 0 ? 'rgba(99,102,241,0.3)' : i % 3 === 1 ? 'rgba(34,211,238,0.25)' : 'rgba(139,92,246,0.3)'}`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>

      {/* === Grid pattern (subtle) === */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* === Logo with premium glow === */}
      <div className="relative z-10 mb-8 sm:mb-10">
        <BrandLogo size="lg" showText={false} glow />
      </div>

      {/* Badge */}
      <div
        className="relative z-10 inline-flex items-center gap-2 text-[11px] sm:text-xs tracking-[0.15em] uppercase font-medium mb-6 sm:mb-8 px-5 py-2 rounded-full backdrop-blur-sm"
        style={{
          color: 'var(--color-accent)',
          backgroundColor: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          boxShadow: '0 0 20px rgba(99,102,241,0.1)',
        }}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--color-accent)' }} />
        </span>
        {c.badge}
      </div>

      {/* Headline */}
      <h1 className="relative z-10 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.08]" style={{ color: 'var(--color-text)' }}>
        {c.headline}
        <br className="sm:hidden" />
        <span className="sm:ml-3 relative">
          {c.brand}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">{c.brandDot}</span>
          {/* Underline glow */}
          <span
            className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), rgba(34,211,238,0.4), transparent)',
            }}
          />
        </span>
      </h1>

      {/* Tagline */}
      <p
        className="relative z-10 mt-6 sm:mt-8 text-[15px] sm:text-base lg:text-lg max-w-lg lg:max-w-2xl leading-relaxed font-normal"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {c.tagline}
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 mt-10 sm:mt-12">
        <a
          href={lh('/signup')}
          className="group/cta relative inline-flex items-center gap-2 text-[14px] font-semibold px-8 py-3.5 rounded-full transition-all duration-300 active:scale-[0.97] hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {c.cta}
          <svg className="w-4 h-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
        <a
          href={lh('/services')}
          className="inline-flex items-center gap-2 text-[14px] font-medium px-7 py-3.5 rounded-full transition-all duration-300 hover:border-[var(--color-accent)] backdrop-blur-sm"
          style={{
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          {c.ctaSecondary}
        </a>
      </div>
    </section>
  )
}
