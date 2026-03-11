'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useTheme } from '@/lib/theme/ThemeContext'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { SERVICES, NAV_CATEGORIES } from '@/lib/services/catalog'

/* ─── Icons (inline SVGs for zero dependency) ─── */
function IconMenu() {
  return <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="16" y2="10"/><line x1="4" y1="14" x2="16" y2="14"/></svg>
}
function IconX() {
  return <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
}
function IconSearch() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function IconSun() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
}
function IconMoon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
}
function IconUser() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function IconHome() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconGrid() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function IconWorkflow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><line x1="5" y1="9" x2="12" y2="15"/><line x1="19" y1="9" x2="12" y2="15"/></svg>
}
function IconChat() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
}
function IconSettings() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function IconGlobe() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
}
function IconPalette() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
}
function IconChevronRight() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
}

/* ─── Locale config ─── */
const LOCALES = [
  { code: 'ka', label: 'ქარ' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'РУС' },
] as const

/* ─── Bottom Nav items ─── */
const BOTTOM_NAV = [
  { path: '/', icon: IconHome, label: { en: 'Home', ka: 'მთავარი', ru: 'Главная' } },
  { path: '/services', icon: IconGrid, label: { en: 'Services', ka: 'სერვისები', ru: 'Сервисы' } },
  { path: '/services/workflow', icon: IconWorkflow, label: { en: 'Pipeline', ka: 'პაიფლაინი', ru: 'Pipeline' } },
  { path: '/services/agent-g', icon: IconChat, label: { en: 'Agent G', ka: 'Agent G', ru: 'Агент G' } },
] as const

/* ═══════════════════════════════════════════════════════════════════
   TopNavbar — modern, clean, theme-aware
   ═══════════════════════════════════════════════════════════════════ */
export function TopNavbar({ onMenuToggle, menuOpen }: { onMenuToggle: () => void; menuOpen: boolean }) {
  const { language: locale, setLanguage, t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  const pathWithoutLocale = pathname.replace(/^\/(ka|en|ru)/, '') || '/'

  const switchLocale = (code: string) => {
    setLanguage(code as 'ka' | 'en' | 'ru')
    router.push('/' + code + pathWithoutLocale)
  }

  const lh = (p: string) => '/' + locale + p

  const filtered = searchQuery.trim()
    ? SERVICES.filter(s => {
        const q = searchQuery.toLowerCase()
        return s.slug.includes(q) || s.title.en.toLowerCase().includes(q) || s.title[locale as 'ka' | 'en' | 'ru']?.toLowerCase().includes(q)
      })
    : []

  const handleSearchSelect = useCallback((slug: string) => {
    setSearchQuery('')
    setSearchOpen(false)
    router.push(lh(`/services/${slug}`))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, router])

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-[200] flex items-center justify-between px-4 sm:px-6 transition-all duration-300 ${
        scrolled ? 'h-14' : 'h-16'
      }`}
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderBottom: '1px solid var(--nav-border)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      }}
    >
      {/* Left: Hamburger + Brand Logo */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--card-hover)]"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <IconX /> : <IconMenu />}
        </button>
        <BrandLogo href={lh('/')} size="nav" showText={!scrolled} compact={scrolled} />
      </div>

      {/* Center: Search (desktop) */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
        <div
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200"
          style={{
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
          }}
        >
          <span style={{ color: 'var(--color-text-tertiary)' }}><IconSearch /></span>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            placeholder={
              locale === 'ka' ? 'სერვისების ძიება...' :
              locale === 'ru' ? 'Поиск сервисов...' :
              'Search services...'
            }
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)', border: 'none', boxShadow: 'none' }}
          />
          <kbd
            className="hidden lg:inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'var(--card-bg)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
          >
            ⌘K
          </kbd>
        </div>
        {/* Search results dropdown */}
        {searchOpen && filtered.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-lg z-50"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {filtered.slice(0, 6).map(s => (
              <button
                key={s.slug}
                onMouseDown={() => handleSearchSelect(s.slug)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--card-hover)]"
                style={{ color: 'var(--color-text)' }}
              >
                <span className="text-base">{s.icon}</span>
                {s.title[locale as 'ka' | 'en' | 'ru'] || s.title.en}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Language + Theme + Auth */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mini search for mobile */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="md:hidden p-2 rounded-lg transition-colors hover:bg-[var(--card-hover)]"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Search"
        >
          <IconSearch />
        </button>

        {/* Language switcher */}
        <div
          className="hidden sm:flex items-center rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {LOCALES.map(loc => (
            <button
              key={loc.code}
              onClick={() => switchLocale(loc.code)}
              className="text-[11px] font-medium px-2.5 py-1.5 transition-all duration-200"
              style={{
                color: locale === loc.code ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
                backgroundColor: locale === loc.code ? 'var(--color-text)' : 'transparent',
              }}
            >
              {loc.label}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--card-hover)]"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>

        {/* Login/Account */}
        <Link
          href={lh('/login')}
          className="hidden sm:flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg transition-colors hover:bg-[var(--card-hover)]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <IconUser />
          <span className="hidden lg:inline">{t('nav.login')}</span>
        </Link>

        {/* Get Started */}
        <Link
          href={lh('/signup')}
          className="text-[13px] font-semibold px-4 py-2 rounded-lg transition-all duration-200 hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {locale === 'ka' ? 'დაწყება' : locale === 'ru' ? 'Начать' : 'Get Started'}
        </Link>
      </div>
    </nav>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SidebarMenu — modern slide-out panel
   ═══════════════════════════════════════════════════════════════════ */
export function SidebarMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language: locale, setLanguage } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()

  const lh = (p: string) => '/' + locale + p
  const pathWithoutLocale = pathname.replace(/^\/(ka|en|ru)/, '') || '/'
  const isActive = (p: string) => {
    const full = '/' + locale + p
    return pathname === full || pathname.startsWith(full + '/')
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}
      {/* Panel */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-[260] w-72 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-16 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <BrandLogo size="nav" showText compact={false} />
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--card-hover)] transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
            <IconX />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_CATEGORIES.map(item => (
            <Link
              key={item.slug}
              href={lh(item.href)}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                isActive(item.href) ? 'font-semibold' : ''
              }`}
              style={{
                color: isActive(item.href) ? 'var(--color-text)' : 'var(--color-text-secondary)',
                backgroundColor: isActive(item.href) ? 'var(--color-accent-soft)' : 'transparent',
              }}
            >
              {item.label[locale as 'ka' | 'en' | 'ru'] || item.label.en}
            </Link>
          ))}
        </div>

        {/* Bottom section — settings */}
        <div className="shrink-0 px-3 pb-4 space-y-1" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
          {/* Language */}
          <div className="flex items-center gap-3 px-3 py-2">
            <span style={{ color: 'var(--color-text-tertiary)' }}><IconGlobe /></span>
            <div className="flex items-center gap-1 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              {LOCALES.map(loc => (
                <button
                  key={loc.code}
                  onClick={() => {
                    setLanguage(loc.code as 'ka' | 'en' | 'ru')
                    router.push('/' + loc.code + pathWithoutLocale)
                  }}
                  className="text-[11px] font-medium px-2.5 py-1 transition-all"
                  style={{
                    color: locale === loc.code ? 'var(--color-bg)' : 'var(--color-text-tertiary)',
                    backgroundColor: locale === loc.code ? 'var(--color-text)' : 'transparent',
                  }}
                >
                  {loc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-[var(--card-hover)]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <span style={{ color: 'var(--color-text-tertiary)' }}><IconPalette /></span>
            {theme === 'dark'
              ? (locale === 'ka' ? 'ღია თემა' : locale === 'ru' ? 'Светлая тема' : 'Light Mode')
              : (locale === 'ka' ? 'მუქი თემა' : locale === 'ru' ? 'Тёмная тема' : 'Dark Mode')}
            <span className="ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </span>
          </button>

          {/* Settings */}
          <Link
            href={lh('/settings')}
            onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-[var(--card-hover)]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <span style={{ color: 'var(--color-text-tertiary)' }}><IconSettings /></span>
            {locale === 'ka' ? 'პარამეტრები' : locale === 'ru' ? 'Настройки' : 'Settings'}
            <span className="ml-auto" style={{ color: 'var(--color-text-tertiary)' }}><IconChevronRight /></span>
          </Link>

          {/* Login */}
          <Link
            href={lh('/login')}
            onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-[var(--card-hover)]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <span style={{ color: 'var(--color-text-tertiary)' }}><IconUser /></span>
            {locale === 'ka' ? 'შესვლა' : locale === 'ru' ? 'Войти' : 'Log In'}
          </Link>
        </div>
      </aside>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   BottomNavigation — mobile/tablet bottom bar
   ═══════════════════════════════════════════════════════════════════ */
export function BottomNavigation() {
  const { language: locale } = useLanguage()
  const pathname = usePathname()

  const lh = (p: string) => '/' + locale + p
  const isHome = pathname === '/' || /^\/(ka|en|ru)\/?$/.test(pathname)
  const isActive = (p: string) => {
    if (p === '/') return isHome
    const full = '/' + locale + p
    return pathname === full || pathname.startsWith(full + '/')
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[200] flex items-center justify-around md:hidden"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderTop: '1px solid var(--nav-border)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {BOTTOM_NAV.map(item => {
        const Icon = item.icon
        const active = isActive(item.path)
        return (
          <Link
            key={item.path}
            href={lh(item.path)}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors"
            style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
          >
            <Icon />
            <span className="text-[10px] font-medium">
              {item.label[locale as keyof typeof item.label] || item.label.en}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
