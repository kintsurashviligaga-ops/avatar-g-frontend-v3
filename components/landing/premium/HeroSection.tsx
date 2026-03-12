'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'

const COPY = {
  en: {
    eyebrow: 'AI-Powered Creative Platform',
    badge: '16 AI Services — One Workspace',
    headline1: 'Create anything',
    headline2: 'with',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Avatars, videos, images, music, marketing content, and business intelligence — powered by multi-modal AI, in one premium workspace.',
    cta: 'Start Creating',
    ctaSecondary: 'Explore Services',
  },
  ka: {
    eyebrow: 'AI-ზე დაფუძნებული კრეატიული პლატფორმა',
    badge: '16 AI სერვისი — ერთ სივრცეში',
    headline1: 'შექმენი ყველაფერი',
    headline2: '',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'ავატარები, ვიდეო, სურათები, მუსიკა, მარკეტინგული კონტენტი და ბიზნეს ინტელექტი — მულტი-მოდალური AI-ით, ერთ პრემიუმ პლატფორმაზე.',
    cta: 'შექმნის დაწყება',
    ctaSecondary: 'სერვისების ნახვა',
  },
  ru: {
    eyebrow: 'AI-платформа для создания контента',
    badge: '16 AI-сервисов — одно пространство',
    headline1: 'Создавайте всё',
    headline2: 'с',
    brand: 'MyAvatar',
    brandDot: '.ge',
    tagline: 'Аватары, видео, изображения, музыка, маркетинговый контент и бизнес-аналитика — на базе мультимодального AI, в одной премиум-платформе.',
    cta: 'Начать создание',
    ctaSecondary: 'Все сервисы',
  },
} as const

/* Pre-computed particle positions to avoid hydration mismatch */
const PARTICLES = [
  { x: 15, y: 20, size: 1.5, delay: 0, dur: 8 },
  { x: 82, y: 28, size: 2, delay: 2, dur: 10 },
  { x: 38, y: 70, size: 1.5, delay: 1, dur: 9 },
  { x: 65, y: 12, size: 1, delay: 3, dur: 11 },
  { x: 90, y: 60, size: 2, delay: 0.5, dur: 8.5 },
  { x: 25, y: 45, size: 1, delay: 4, dur: 10 },
  { x: 75, y: 78, size: 1.5, delay: 1.5, dur: 9 },
  { x: 50, y: 8, size: 2, delay: 3.5, dur: 8 },
]

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative flex flex-col items-center justify-center text-center px-6 pt-28 pb-12 sm:pt-36 sm:pb-16 lg:pt-44 lg:pb-24 overflow-hidden">

      {/* ── Layer 1: Gradient base ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, var(--hero-glow-primary, rgba(99,102,241,0.10)) 0%, transparent 70%)',
        }}
      />

      {/* ── Layer 2: Dot grid texture ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(var(--color-text) 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* ── Layer 3: Focal glow (indigo center) ── */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] sm:w-[800px] sm:h-[500px] pointer-events-none animate-pulse-slow"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 50% 30%, rgba(99,102,241,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Violet accent (offset left) */}
      <div
        className="absolute top-16 left-1/2 -translate-x-[65%] w-[350px] h-[250px] sm:w-[500px] sm:h-[350px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 40% 45%, rgba(139,92,246,0.07) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
      {/* Blue accent (offset right) */}
      <div
        className="absolute top-24 right-[15%] w-[250px] h-[180px] sm:w-[350px] sm:h-[250px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 60% at 60% 50%, rgba(59,130,246,0.06) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* ── Floating particles (subtle) ── */}
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
              background: i % 2 === 0
                ? 'rgba(99,102,241,0.35)'
                : 'rgba(139,92,246,0.30)',
              boxShadow: `0 0 ${p.size * 4}px ${i % 2 === 0 ? 'rgba(99,102,241,0.2)' : 'rgba(139,92,246,0.2)'}`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>

      {/* ── Logo ── */}
      <div className="relative z-10 mb-10 sm:mb-12">
        <BrandLogo size="xl" showText={false} glow />
      </div>

      {/* ── Eyebrow label ── */}
      <div
        className="relative z-10 inline-flex items-center gap-2.5 text-[11px] sm:text-xs tracking-[0.18em] uppercase font-medium mb-7 sm:mb-8 px-5 py-2.5 rounded-full backdrop-blur-sm"
        style={{
          color: 'var(--color-accent)',
          backgroundColor: 'var(--color-accent-soft)',
          border: '1px solid rgba(99,102,241,0.15)',
        }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: 'var(--color-accent)' }} />
        </span>
        {c.eyebrow}
      </div>

      {/* ── Headline ── */}
      <h1
        className="relative z-10 text-[2.5rem] sm:text-5xl lg:text-6xl xl:text-[4.25rem] font-bold tracking-[-0.025em] leading-[1.1]"
        style={{ color: 'var(--color-text)' }}
      >
        {c.headline1}
        {c.headline2 && (
          <>
            <br className="hidden sm:block" />
            <span className="sm:inline"> {c.headline2} </span>
          </>
        )}
        <span className="relative whitespace-nowrap">
          {c.brand}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">{c.brandDot}</span>
          {/* Accent underline */}
          <span
            className="absolute -bottom-1.5 left-0 right-0 h-[2px] rounded-full opacity-60"
            style={{
              background: 'linear-gradient(90deg, transparent 5%, rgba(99,102,241,0.5) 30%, rgba(139,92,246,0.4) 70%, transparent 95%)',
            }}
          />
        </span>
      </h1>

      {/* ── Tagline ── */}
      <p
        className="relative z-10 mt-6 sm:mt-8 text-[15px] sm:text-base lg:text-[17px] max-w-lg lg:max-w-xl leading-[1.7] font-normal"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {c.tagline}
      </p>

      {/* ── CTAs ── */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3.5 mt-10 sm:mt-12">
        {/* Primary CTA */}
        <a
          href={lh('/signup')}
          className="ag-btn-primary text-[14px] px-8 py-3.5 rounded-xl"
        >
          {c.cta}
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
        {/* Secondary CTA */}
        <a
          href={lh('/services')}
          className="btn-ghost text-[14px] px-7 py-3.5 rounded-xl"
        >
          {c.ctaSecondary}
        </a>
      </div>

      {/* ── Trust signal ── */}
      <p
        className="relative z-10 mt-8 text-[11px] sm:text-xs tracking-wide font-medium uppercase opacity-50"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {c.badge}
      </p>
    </section>
  )
}
