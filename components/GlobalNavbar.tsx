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

  const pathWithoutLocale = pathname.replace(/^\/(ka|en|ru)/, '') || '/'

  const switchLocale = (code: string) => {
    setLanguage(code as 'ka' | 'en' | 'ru')
    router.push('/' + code + pathWithoutLocale)
  }

  const localeHref = (path: string) => '/' + locale + path

  const isActive = (path: string) => {
    const full = '/' + locale + path
    return pathname === full || pathname.startsWith(full + '/')
  }

  return (
    <>
      <nav className="fixed top-0 inset-x-0 z-50 h-16 md:h-24 transition-[height] duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-10 bg-white/[0.03] backdrop-blur-2xl border-b border-white/[0.08]">

        {/* Logo — 96px desktop, 68px mobile */}
        <Link href={localeHref('/')} className="flex items-center gap-3 flex-shrink-0 group" aria-label="MyAvatar.ge home">
          <div className="relative w-[68px] h-[68px] md:w-[96px] md:h-[96px] flex-shrink-0">
            <Image
              src="/brand/logo.png"
              alt="Avatar G logo"
              fill
              sizes="(min-width:768px) 96px, 68px"
              priority
              className="object-contain drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]"
            />
          </div>
          <span className="hidden sm:block font-semibold text-[20px] text-white tracking-tight">
            {'MyAvatar'}
            <span className="text-white/30">{'.ge'}</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-0.5">
          {NAV_ITEMS.map(function(item) {
            return (
              <Link
                key={item.path}
                href={localeHref(item.path)}
                className={
                  'px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all ' +
                  (isActive(item.path)
                    ? 'text-white bg-white/[0.09]'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]')
                }
              >
                {t(item.key)}
              </Link>
            )
          })}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-1 py-0.5">
            {LOCALES.map(function(loc) {
              return (
                <button
                  key={loc.code}
                  onClick={function() { switchLocale(loc.code) }}
                  className={
                    'text-[11px] font-semibold px-2 py-1 rounded-full transition-all ' +
                    (locale === loc.code
                      ? 'bg-white text-[#050510]'
                      : 'text-white/40 hover:text-white')
                  }
                >
                  {loc.label}
                </button>
              )
            })}
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
            onClick={function() { setOpen(function(v) { return !v }) }}
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
        <div className="fixed top-16 inset-x-0 z-40 bg-black/90 backdrop-blur-2xl border-b border-white/[0.08] px-4 py-4 space-y-1 lg:hidden">
          {NAV_ITEMS.map(function(item) {
            return (
              <Link
                key={item.path}
                href={localeHref(item.path)}
                onClick={function() { setOpen(false) }}
                className={
                  'block px-3 py-3 text-sm rounded-xl transition-all ' +
                  (isActive(item.path)
                    ? 'text-white bg-white/[0.09]'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.06]')
                }
              >
                {t(item.key)}
              </Link>
            )
          })}
          <div className="border-t border-white/[0.06] pt-3 mt-1 grid grid-cols-2 gap-2">
            <Link href={localeHref('/login')} onClick={function() { setOpen(false) }}
              className="text-center text-sm text-white/60 border border-white/[0.1] py-2.5 rounded-xl hover:bg-white/[0.05]">
              {t('nav.login')}
            </Link>
            <Link href={localeHref('/signup')} onClick={function() { setOpen(false) }}
              className="text-center text-sm font-semibold bg-white text-[#050510] py-2.5 rounded-xl hover:bg-white/90">
              {t('nav.signup')}
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
