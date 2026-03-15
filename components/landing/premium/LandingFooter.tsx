'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const FOOTER_COPY = {
  en: { services: 'Services', platform: 'Platform', resources: 'Resources', legal: 'Legal', rights: 'All rights reserved.', lang: 'Language' },
  ka: { services: 'სერვისები', platform: 'პლატფორმა', resources: 'რესურსები', legal: 'სამართლებრივი', rights: 'ყველა უფლება დაცულია.', lang: 'ენა' },
  ru: { services: 'Сервисы', platform: 'Платформа', resources: 'Ресурсы', legal: 'Юридическое', rights: 'Все права защищены.', lang: 'Язык' },
} as const

export function LandingFooter() {
  const { language, setLanguage } = useLanguage()
  const c = FOOTER_COPY[language] || FOOTER_COPY.en
  const lh = (p: string) => `/${language}${p}`

  return (
    <footer className="px-4 sm:px-6 lg:px-10 pt-16 pb-8" style={{ borderTop: '1px solid var(--color-border)', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="max-w-6xl mx-auto">
        {/* Top: Logo + columns */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative w-7 h-7">
                <Image src="/brand/rocket-brain.svg" alt="MyAvatar.ge" fill sizes="28px" className="object-contain" />
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>MyAvatar.ge</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
              AI Production Studio
            </p>
          </div>

          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.services}</p>
            <div className="space-y-2.5 text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
              <Link href={lh('/services/avatar')} className="block py-0.5 transition-colors hover:opacity-70">Avatar Studio</Link>
              <Link href={lh('/services/video')} className="block py-0.5 transition-colors hover:opacity-70">Video</Link>
              <Link href={lh('/services/image')} className="block py-0.5 transition-colors hover:opacity-70">Image</Link>
              <Link href={lh('/services/music')} className="block py-0.5 transition-colors hover:opacity-70">Music</Link>
              <Link href={lh('/services/text')} className="block py-0.5 transition-colors hover:opacity-70">Text &amp; Copy</Link>
              <Link href={lh('/services/agent-g')} className="block py-0.5 transition-colors hover:opacity-70">Agent G</Link>
            </div>
          </div>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.platform}</p>
            <div className="space-y-2.5 text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
              <Link href={lh('/services')} className="block py-0.5 transition-colors hover:opacity-70">{c.services}</Link>
              <Link href={lh('/pricing')} className="block py-0.5 transition-colors hover:opacity-70">Pricing</Link>
              <Link href={lh('/workspace')} className="block py-0.5 transition-colors hover:opacity-70">Workspace</Link>
              <Link href={lh('/business')} className="block py-0.5 transition-colors hover:opacity-70">Business</Link>
            </div>
          </div>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.resources}</p>
            <div className="space-y-2.5 text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
              <Link href={lh('/about')} className="block py-0.5 transition-colors hover:opacity-70">About</Link>
              <Link href={lh('/contact')} className="block py-0.5 transition-colors hover:opacity-70">Contact</Link>
              <Link href={lh('/blog')} className="block py-0.5 transition-colors hover:opacity-70">Blog</Link>
              <Link href={lh('/careers')} className="block py-0.5 transition-colors hover:opacity-70">Careers</Link>
            </div>
          </div>
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{c.legal}</p>
            <div className="space-y-2.5 text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
              <Link href={lh('/privacy')} className="block py-0.5 transition-colors hover:opacity-70">Privacy</Link>
              <Link href={lh('/terms')} className="block py-0.5 transition-colors hover:opacity-70">Terms</Link>
              <Link href={lh('/cookies')} className="block py-0.5 transition-colors hover:opacity-70">Cookies</Link>
              <Link href={lh('/licenses')} className="block py-0.5 transition-colors hover:opacity-70">Licenses</Link>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          <span>&copy; {new Date().getFullYear()} MyAvatar.ge &mdash; {c.rights}</span>
          {/* Language switch */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider mr-1">{c.lang}:</span>
            {(['en', 'ka', 'ru'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: language === l ? 'var(--color-accent-soft)' : 'transparent',
                  color: language === l ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
              >
                {l === 'en' ? 'English' : l === 'ka' ? 'ქართული' : 'Русский'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
