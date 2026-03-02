'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const NAV_ITEMS = [
  { path: '/services', key: 'nav.services' },
  { path: '/services/avatar', key: 'nav.avatar' },
  { path: '/services/video', key: 'nav.video' },
  { path: '/services/editing', key: 'nav.editing' },
  { path: '/services/music', key: 'nav.music' },
  { path: '/business', key: 'nav.business' },
  { path: '/pricing', key: 'nav.pricing' },
] as const

const LOCALES = [
  { code: 'ka', label: 'ქარ' },
  { code: 'en', label: 'ENG' },
  { code: 'ru', label: 'РУС' },
] as const

export function GlobalNavbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { language: locale, setLanguage, t } = useLanguage()

  // Extract current path without locale prefix for navigation
  const pathWithoutLocale = pathname.replace(/^\/(ka|en|ru)/, '') || '/'

  const switchLocale = (code: string) => {
    setLanguage(code as 'ka' | 'en' | 'ru')
    // Actually navigate to the new locale URL
    router.push(`/${code}${pathWithoutLocale}`)
  }

  // Build locale-aware href
  const localeHref = (path: string) => `/${locale}${path}`

  const isActive = (path: string) => {
    const full = `/${locale}${path}`
    return pathname === full || pathname.startsWith(full + '/')
  }

  return (
    <>
      <nav className="
        fixed top-0 inset-x-0 z-50 h-16
        flex items-center justify-between
        px-4 sm:px-6 lg:px-10
        bg-[#050510]/95 backdrop-blur-xl
        border-b border-white/[0.06]
      ">
        {/* Logo */}
        <Link href={localeHref('/')} className="flex items-center gap-3 flex-shrink-0 group" aria-label="MyAvatar.ge home">
          <div className="relative h-12 w-12 sm:h-[48px] sm:w-[48px] md:h-[52px] md:w-[52px] flex-shrink-0">
            <Image
              src="/brand/logo.png"
              alt="Avatar G logo"
              fill
              sizes="52px"
              priority
              className="object-contain drop-shadow-[0_0_14px_rgba(6,182,212,0.3)]"
            />
          </div>
          <span className="hidden sm:block font-bold text-[17px] text-white tracking-tight">
            MyAvatar<span className="text-white/35">.ge</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-0.5">
          {NAV_ITEMS.map(({ path, key }) => (
            <Link
              key={path}
              href={localeHref(path)}
              className={`
                px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all
                ${isActive(path)
                  ? 'text-white bg-white/[0.09]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.06]'}
              `}
            >
              {t(key)}
            </Link>
          ))}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-1 py-0.5">
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => switchLocale(code)}
                className={`
                  text-[11px] font-semibold px-2 py-1 rounded-full transition-all
                  ${locale === code
                    ? 'bg-white text-[#050510]'
                    : 'text-white/40 hover:text-white'}
                `}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Auth — desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <Link href={localeHref('/login')}
              className="text-[13px] text-white/55 hover:text-white transition-colors px-3 py-1.5">
              {t('nav.login')}
            </Link>
            <Link href={localeHref('/signup')}
              className="text-[13px] font-semibold bg-white text-[#050510] px-4 py-2 rounded-xl hover:bg-white/90 transition-all">
              {t('nav.getStarted')}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(v => !v)}
            className="lg:hidden p-2 text-white/50 hover:text-white transition-colors"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}>
              {open
                ? <><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></>
                : <><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/></>
              }
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="
          fixed top-16 inset-x-0 z-40
          bg-[#050510]/98 backdrop-blur-xl
          border-b border-white/[0.06]
          px-4 py-4 space-y-1
          lg:hidden
        ">
          {NAV_ITEMS.map(({ path, key }) => (
            <Link
              key={path}
              href={localeHref(path)}
              onClick={() => setOpen(false)}
              className={`
                block px-3 py-3 text-sm rounded-xl transition-all
                ${isActive(path)
                  ? 'text-white bg-white/[0.09]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}
              `}
            >
              {t(key)}
            </Link>
          ))}
          <div className="border-t border-white/[0.06] pt-3 mt-1 grid grid-cols-2 gap-2">
            <Link href={localeHref('/login')} onClick={() => setOpen(false)}
              className="text-center text-sm text-white/60 border border-white/[0.1] py-2.5 rounded-xl hover:bg-white/[0.05]">
              {t('nav.login')}
            </Link>
            <Link href={localeHref('/signup')} onClick={() => setOpen(false)}
              className="text-center text-sm font-semibold bg-white text-[#050510] py-2.5 rounded-xl hover:bg-white/90">
              {t('nav.signup')}
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
