'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'

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

  const navCls = 'fixed top-0 inset-x-0 z-50 h-16 md:h-20 transition-all duration-500 flex items-center justify-between px-4 sm:px-6 lg:px-10 bg-[#030712]/60 backdrop-blur-2xl backdrop-saturate-150 border-b border-white/[0.06]'

  const drawerBase = 'fixed top-16 inset-x-0 z-40 bg-[#030712]/95 backdrop-blur-2xl border-b border-white/[0.08] px-4 py-4 space-y-1 lg:hidden transition-all duration-300 origin-top'

  const drawerState = open
    ? 'opacity-100 scale-y-100 translate-y-0'
    : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'

  return (
    <>
      <nav className={navCls}>
        <div className="md:hidden">
          <BrandLogo href={localeHref('/')} size="xs" showText={false} />
        </div>
        <div className="hidden md:block">
          <BrandLogo href={localeHref('/')} size="sm" />
        </div>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-0.5">
          {NAV_ITEMS.map(function(item) {
            const cls = isActive(item.path)
              ? 'px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all text-white bg-white/[0.09]'
              : 'px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all text-white/50 hover:text-white hover:bg-white/[0.06]'
            return (
              <Link key={item.path} href={localeHref(item.path)} className={cls}>
                {t(item.key)}
              </Link>
            )
          })}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-full px-1 py-0.5">
            {LOCALES.map(function(loc) {
              const cls = locale === loc.code
                ? 'text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all duration-300 bg-white text-[#030712] shadow-sm'
                : 'text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all duration-300 text-white/35 hover:text-white/70'
              return (
                <button
                  key={loc.code}
                  onClick={function() { switchLocale(loc.code) }}
                  className={cls}
                >
                  {loc.label}
                </button>
              )
            })}
          </div>

          {/* Auth — desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href={localeHref('/login')}
              className="text-[13px] text-white/45 hover:text-white transition-colors duration-300 px-3 py-1.5"
            >
              {t('nav.login')}
            </Link>
            <Link
              href={localeHref('/signup')}
              className="text-[13px] font-semibold bg-white text-[#030712] px-5 py-2.5 rounded-xl hover:bg-white/90 transition-all duration-300 shadow-[0_2px_12px_rgba(255,255,255,0.08)]"
            >
              {t('nav.getStarted')}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={function() { setOpen(function(v) { return !v }) }}
            className="lg:hidden p-2.5 text-white/60 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all duration-200"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              {open ? (
                <g>
                  <line x1="5" y1="5" x2="17" y2="17" />
                  <line x1="17" y1="5" x2="5" y2="17" />
                </g>
              ) : (
                <g>
                  <line x1="4" y1="7" x2="18" y2="7" />
                  <line x1="4" y1="11" x2="18" y2="11" />
                  <line x1="4" y1="15" x2="18" y2="15" />
                </g>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={drawerBase + ' ' + drawerState}>
        {NAV_ITEMS.map(function(item) {
          const cls = isActive(item.path)
            ? 'block px-3 py-3 text-sm rounded-xl transition-all text-white bg-white/[0.09]'
            : 'block px-3 py-3 text-sm rounded-xl transition-all text-white/60 hover:text-white hover:bg-white/[0.06]'
          return (
            <Link
              key={item.path}
              href={localeHref(item.path)}
              onClick={function() { setOpen(false) }}
              className={cls}
            >
              {t(item.key)}
            </Link>
          )
        })}
        <div className="border-t border-white/[0.06] pt-3 mt-1 grid grid-cols-2 gap-2">
          <Link
            href={localeHref('/login')}
            onClick={function() { setOpen(false) }}
            className="text-center text-sm text-white/60 border border-white/[0.1] py-2.5 rounded-xl hover:bg-white/[0.05] transition-all duration-200"
          >
            {t('nav.login')}
          </Link>
          <Link
            href={localeHref('/signup')}
            onClick={function() { setOpen(false) }}
            className="text-center text-sm font-semibold bg-white text-[#030712] py-2.5 rounded-xl hover:bg-white/90 transition-all duration-200"
          >
            {t('nav.signup')}
          </Link>
        </div>
      </div>
    </>
  )
}
