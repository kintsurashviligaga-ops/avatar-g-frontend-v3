'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'

const LOCALES = [
  { code: 'ka', label: 'ქარ' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'РУ' },
] as const

export function LandingNavbar() {
  const { language: locale, setLanguage, t } = useLanguage()

  const switchLocale = (code: string) => {
    setLanguage(code as 'ka' | 'en' | 'ru')
    // Navigation is handled by LanguageContext + router
  }

  const localeHref = (path: string) => '/' + locale + path

  return (
    <nav className="fixed top-0 inset-x-0 z-[200] h-14 flex items-center justify-between px-4 sm:px-6 lg:px-10 bg-black/60 backdrop-blur-2xl border-b border-white/[0.06]">
      {/* Logo */}
      <BrandLogo href={localeHref('/')} size="nav" showText compact={false} />

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Language */}
        <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-1 py-0.5">
          {LOCALES.map((loc) => (
            <button
              key={loc.code}
              onClick={() => switchLocale(loc.code)}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-all duration-200 ${
                locale === loc.code
                  ? 'bg-white/[0.12] text-white'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {loc.label}
            </button>
          ))}
        </div>

        {/* Login */}
        <Link
          href={localeHref('/login')}
          className="hidden sm:block text-[13px] text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
        >
          {t('nav.login')}
        </Link>

        {/* Get Started */}
        <Link
          href={localeHref('/signup')}
          className="text-[12px] sm:text-[13px] font-medium bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition-all"
        >
          {t('nav.getStarted')}
        </Link>
      </div>
    </nav>
  )
}
