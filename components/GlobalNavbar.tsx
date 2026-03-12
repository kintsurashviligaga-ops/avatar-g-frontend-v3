'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
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
  const [scrolled, setScrolled] = useState(false)
  const { language: locale, setLanguage, t } = useLanguage()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 15)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  const navCls = `fixed top-0 inset-x-0 z-[200] ${scrolled ? 'h-14 md:h-16' : 'h-16 md:h-20'} transition-all duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-10 backdrop-blur-2xl backdrop-saturate-150 pointer-events-auto border-b`
    + ` ${scrolled ? 'shadow-[0_4px_24px_rgba(0,0,0,0.08)]' : 'shadow-[0_2px_16px_rgba(0,0,0,0.04)]'}`

  const drawerBase = `fixed ${scrolled ? 'top-14' : 'top-16'} inset-x-0 z-[199] backdrop-blur-2xl px-4 py-4 space-y-1 lg:hidden transition-all duration-300 origin-top pointer-events-auto`

  const drawerState = open
    ? 'opacity-100 scale-y-100 translate-y-0'
    : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'

  return (
    <>
      <nav className={navCls} style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}>
        <div className="md:hidden">
          <BrandLogo href={localeHref('/')} size="nav" showText={true} compact={scrolled} />
        </div>
        <div className="hidden md:block">
          <BrandLogo href={localeHref('/')} size="xs" showText={true} compact={scrolled} />
        </div>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-0.5">
          {NAV_ITEMS.map(function(item) {
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                href={localeHref(item.path)}
                className={`px-3 py-1.5 text-[13px] rounded-lg transition-all duration-200 ${
                  active ? 'font-semibold' : 'font-medium hover:opacity-80'
                }`}
                style={{
                  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                  border: active ? '1px solid var(--color-border-hover)' : '1px solid transparent',
                }}
              >
                {t(item.key)}
              </Link>
            )
          })}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="flex items-center gap-0.5 rounded-full px-1 py-0.5" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
            {LOCALES.map(function(loc) {
              const isActive = locale === loc.code
              return (
                <button
                  key={loc.code}
                  onClick={function() { switchLocale(loc.code) }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: isActive ? 'var(--color-accent)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--color-text-tertiary)',
                  }}
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
              className="text-[13px] transition-colors duration-300 px-3 py-1.5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t('nav.login')}
            </Link>
            <Link
              href={localeHref('/signup')}
              className="text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-all duration-300 ag-btn-primary"
            >
              {t('nav.getStarted')}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={function() { setOpen(function(v) { return !v }) }}
            className="lg:hidden p-2.5 rounded-lg transition-all duration-200"
            style={{ color: 'var(--color-text-secondary)' }}
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
      <div className={drawerBase + ' ' + drawerState} style={{ backgroundColor: 'var(--nav-bg)', borderBottom: '1px solid var(--nav-border)' }}>
        {NAV_ITEMS.map(function(item) {
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              href={localeHref(item.path)}
              onClick={function() { setOpen(false) }}
              className={`block px-3 py-3 text-sm rounded-xl transition-all ${
                active ? 'font-semibold' : 'font-medium'
              }`}
              style={{
                color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                border: active ? '1px solid var(--color-border-hover)' : '1px solid transparent',
              }}
            >
              {t(item.key)}
            </Link>
          )
        })}
        <div className="pt-3 mt-1 grid grid-cols-2 gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Link
            href={localeHref('/login')}
            onClick={function() { setOpen(false) }}
            className="text-center text-sm py-2.5 rounded-xl transition-all duration-200"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            {t('nav.login')}
          </Link>
          <Link
            href={localeHref('/signup')}
            onClick={function() { setOpen(false) }}
            className="text-center text-sm font-semibold py-2.5 rounded-xl ag-btn-primary"
          >
            {t('nav.signup')}
          </Link>
        </div>
      </div>

      <div className={`pointer-events-none fixed ${scrolled ? 'top-14' : 'top-16'} left-0 right-0 z-[39] ag-divider opacity-60 transition-all duration-300`} />
    </>
  )
}
