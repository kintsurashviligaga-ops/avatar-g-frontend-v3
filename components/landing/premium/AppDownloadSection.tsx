'use client'

/**
 * AppDownloadSection — Realistic App Store + Google Play download badges.
 * Official-style SVG badges rendered inline for maximum sharpness.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'

type Locale = 'en' | 'ka' | 'ru'

const COPY: Record<Locale, { heading: string; sub: string }> = {
  en: {
    heading: 'Get the MyAvatar App',
    sub: 'Create, manage, and share AI content from your phone.',
  },
  ka: {
    heading: 'გადმოწერე MyAvatar აპი',
    sub: 'შექმენი, მართე და გააზიარე AI კონტენტი ტელეფონიდან.',
  },
  ru: {
    heading: 'Скачайте приложение MyAvatar',
    sub: 'Создавайте, управляйте и делитесь AI-контентом с телефона.',
  },
}

/* ─── Apple App Store Badge (Official Style SVG) ──────────────── */
function AppStoreBadge() {
  return (
    <a
      href="#"
      aria-label="Download on the App Store"
      className="inline-block transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
    >
      <svg width="160" height="53" viewBox="0 0 160 53" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
        <rect width="160" height="53" rx="8" fill="#000" />
        <rect x="0.5" y="0.5" width="159" height="52" rx="7.5" stroke="rgba(255,255,255,0.2)" fill="none" />
        {/* Apple logo */}
        <g transform="translate(14, 10)">
          <path d="M18.87 10.17c-.1-2.57 2.1-3.82 2.2-3.88a4.76 4.76 0 00-3.76-2.03c-1.58-.17-3.12.95-3.93.95-.82 0-2.07-.93-3.42-.9a5.05 5.05 0 00-4.25 2.59c-1.83 3.16-.47 7.82 1.29 10.38.88 1.26 1.91 2.66 3.26 2.61 1.32-.05 1.81-.85 3.4-.85 1.58 0 2.04.85 3.41.82 1.42-.02 2.3-1.26 3.15-2.53a10.9 10.9 0 001.43-2.93 4.43 4.43 0 01-2.7-4.07zM16.36 2.42A4.5 4.5 0 0017.42 0a4.57 4.57 0 00-2.96 1.53 4.28 4.28 0 00-1.09 3.1 3.78 3.78 0 002.99-1.21z" fill="#fff" transform="scale(0.72)" />
        </g>
        {/* Text */}
        <text x="42" y="18" fill="#fff" fontSize="8" fontFamily="system-ui,-apple-system,sans-serif" fontWeight="400" letterSpacing="0.02em">
          Download on the
        </text>
        <text x="42" y="36" fill="#fff" fontSize="16" fontFamily="system-ui,-apple-system,sans-serif" fontWeight="600" letterSpacing="-0.01em">
          App Store
        </text>
      </svg>
    </a>
  )
}

/* ─── Google Play Badge (Official Style SVG) ──────────────────── */
function GooglePlayBadge() {
  return (
    <a
      href="#"
      aria-label="Get it on Google Play"
      className="inline-block transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
    >
      <svg width="180" height="53" viewBox="0 0 180 53" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
        <rect width="180" height="53" rx="8" fill="#000" />
        <rect x="0.5" y="0.5" width="179" height="52" rx="7.5" stroke="rgba(255,255,255,0.2)" fill="none" />
        {/* Google Play triangle */}
        <g transform="translate(14, 11)">
          <defs>
            <linearGradient id="gp-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#00C3FF" /><stop offset="100%" stopColor="#1A73E8" /></linearGradient>
            <linearGradient id="gp-green" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#00E676" /><stop offset="100%" stopColor="#00C853" /></linearGradient>
            <linearGradient id="gp-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF3D00" /><stop offset="100%" stopColor="#F44336" /></linearGradient>
            <linearGradient id="gp-yellow" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#FFD600" /><stop offset="100%" stopColor="#FFAB00" /></linearGradient>
          </defs>
          {/* Play icon - properly colored quadrants */}
          <path d="M1 2.36V28.64a1.5 1.5 0 002.24 1.3L18.36 16.3a1.5 1.5 0 000-2.6L3.24 1.06A1.5 1.5 0 001 2.36z" fill="url(#gp-blue)" transform="scale(0.82)" />
          <path d="M1 2.36L12.75 15.5 3.24 1.06A1.5 1.5 0 001 2.36z" fill="url(#gp-green)" transform="scale(0.82)" />
          <path d="M1 28.64l11.75-13.14L18.36 16.3a1.5 1.5 0 010 -2.6l-5.61 14.24L3.24 29.94A1.5 1.5 0 011 28.64z" fill="url(#gp-red)" transform="scale(0.82)" />
          <path d="M12.75 15.5L1 28.64V2.36L12.75 15.5z" fill="url(#gp-yellow)" transform="scale(0.82)" opacity="0.3" />
        </g>
        {/* Text */}
        <text x="42" y="18" fill="#fff" fontSize="8" fontFamily="system-ui,-apple-system,sans-serif" fontWeight="400" letterSpacing="0.02em">
          GET IT ON
        </text>
        <text x="42" y="36" fill="#fff" fontSize="15.5" fontFamily="system-ui,-apple-system,sans-serif" fontWeight="600" letterSpacing="-0.01em">
          Google Play
        </text>
      </svg>
    </a>
  )
}

/* ─── Main Section ────────────────────────────────────────────── */
export function AppDownloadSection() {
  const { language } = useLanguage()
  const lang = (language as Locale) || 'en'
  const c = COPY[lang] || COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 sm:py-20 overflow-hidden">
      {/* Subtle ambient light */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,211,238,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        {/* Phone icon */}
        <div
          className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0.04) 100%)',
            border: '1px solid rgba(34,211,238,0.12)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>

        {/* Heading */}
        <h2
          className="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
          style={{ color: 'var(--color-text)' }}
        >
          {c.heading}
        </h2>

        {/* Subtext */}
        <p
          className="text-sm sm:text-base mb-8 leading-relaxed"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {c.sub}
        </p>

        {/* Badges — side by side (desktop), stacked (mobile) */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <AppStoreBadge />
          <GooglePlayBadge />
        </div>

        {/* Subtle coming soon note */}
        <p className="mt-5 text-[11px]" style={{ color: 'var(--color-text-tertiary)', opacity: 0.6 }}>
          {lang === 'ka' ? 'მალე ხელმისაწვდომი' : lang === 'ru' ? 'Скоро в магазинах' : 'Coming soon to stores'}
        </p>
      </div>
    </section>
  )
}
