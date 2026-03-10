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
    <footer className="px-4 sm:px-6 lg:px-10 pt-10 pb-8 border-t border-white/[0.04]">
      <div className="max-w-3xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-[12px] text-white/25">
          <div>
            <p className="text-white/40 font-medium mb-3 text-[11px] uppercase tracking-wider">{c.services}</p>
            <div className="space-y-2">
              <Link href={lh('/services/avatar')} className="block hover:text-white/50 transition-colors">Avatar</Link>
              <Link href={lh('/services/video')} className="block hover:text-white/50 transition-colors">Video</Link>
              <Link href={lh('/services/image')} className="block hover:text-white/50 transition-colors">Image</Link>
              <Link href={lh('/services/music')} className="block hover:text-white/50 transition-colors">Music</Link>
            </div>
          </div>
          <div>
            <p className="text-white/40 font-medium mb-3 text-[11px] uppercase tracking-wider">{c.platform}</p>
            <div className="space-y-2">
              <Link href={lh('/services')} className="block hover:text-white/50 transition-colors">{c.services}</Link>
              <Link href={lh('/pricing')} className="block hover:text-white/50 transition-colors">Pricing</Link>
              <Link href={lh('/business')} className="block hover:text-white/50 transition-colors">Business</Link>
            </div>
          </div>
          <div>
            <p className="text-white/40 font-medium mb-3 text-[11px] uppercase tracking-wider">{c.company}</p>
            <div className="space-y-2">
              <Link href={lh('/about')} className="block hover:text-white/50 transition-colors">About</Link>
              <Link href={lh('/contact')} className="block hover:text-white/50 transition-colors">Contact</Link>
            </div>
          </div>
          <div>
            <p className="text-white/40 font-medium mb-3 text-[11px] uppercase tracking-wider">{c.legal}</p>
            <div className="space-y-2">
              <Link href={lh('/privacy')} className="block hover:text-white/50 transition-colors">Privacy</Link>
              <Link href={lh('/terms')} className="block hover:text-white/50 transition-colors">Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/15">
          <span>© {new Date().getFullYear()} MyAvatar.ge</span>
          <span>{c.rights}</span>
        </div>
      </div>
    </footer>
  )
}
