'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const FOOTER_COPY = {
  en: { platform: 'Platform', services: 'Services', company: 'Company', legal: 'Legal', rights: 'All rights reserved.' },
  ka: { platform: 'პლატფორმა', services: 'სერვისები', company: 'კომპანია', legal: 'სამართლებრივი', rights: 'ყველა უფლება დაცულია.' },
  ru: { platform: 'Платформа', services: 'Сервисы', company: 'Компания', legal: 'Юридическое', rights: 'Все права защищены.' },
} as const

export function LandingFooter() {
  const { language } = useLanguage()
  const c = FOOTER_COPY[language] || FOOTER_COPY.en
  const lh = (p: string) => `/${language}${p}`

  return (
    <footer className="px-4 sm:px-6 lg:px-10 pt-10 pb-8" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.services}</p>
            <div className="space-y-2">
              <Link href={lh('/services/avatar')} className="block transition-colors hover:opacity-70">Avatar</Link>
              <Link href={lh('/services/video')} className="block transition-colors hover:opacity-70">Video</Link>
              <Link href={lh('/services/image')} className="block transition-colors hover:opacity-70">Image</Link>
              <Link href={lh('/services/music')} className="block transition-colors hover:opacity-70">Music</Link>
            </div>
          </div>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.platform}</p>
            <div className="space-y-2">
              <Link href={lh('/services')} className="block transition-colors hover:opacity-70">{c.services}</Link>
              <Link href={lh('/pricing')} className="block transition-colors hover:opacity-70">Pricing</Link>
              <Link href={lh('/business')} className="block transition-colors hover:opacity-70">Business</Link>
            </div>
          </div>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.company}</p>
            <div className="space-y-2">
              <Link href={lh('/about')} className="block transition-colors hover:opacity-70">About</Link>
              <Link href={lh('/contact')} className="block transition-colors hover:opacity-70">Contact</Link>
            </div>
          </div>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.legal}</p>
            <div className="space-y-2">
              <Link href={lh('/privacy')} className="block transition-colors hover:opacity-70">Privacy</Link>
              <Link href={lh('/terms')} className="block transition-colors hover:opacity-70">Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          <span>© {new Date().getFullYear()} MyAvatar.ge</span>
          <span>{c.rights}</span>
        </div>
      </div>
    </footer>
  )
}
