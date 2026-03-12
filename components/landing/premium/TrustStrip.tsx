'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: 'Powered by advanced AI technologies',
  ka: 'მოწინავე AI ტექნოლოგიებით',
  ru: 'На базе передовых AI-технологий',
} as const

const TECH_LOGOS = [
  { name: 'OpenAI', icon: '🧠' },
  { name: 'Replicate', icon: '🔮' },
  { name: 'Stable Diffusion', icon: '🎨' },
  { name: 'ElevenLabs', icon: '🔊' },
  { name: 'RunwayML', icon: '🎬' },
  { name: 'Supabase', icon: '⚡' },
  { name: 'Vercel', icon: '▲' },
  { name: 'Stripe', icon: '💳' },
]

export function TrustStrip() {
  const { language } = useLanguage()

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-xs sm:text-sm font-medium mb-8" style={{ color: 'var(--color-text-tertiary)' }}>
          {COPY[language] || COPY.en}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {TECH_LOGOS.map(t => (
            <div key={t.name} className="flex items-center gap-2 opacity-50 hover:opacity-80 transition-opacity">
              <span className="text-lg">{t.icon}</span>
              <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
