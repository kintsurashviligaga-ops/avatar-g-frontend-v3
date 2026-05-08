'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { SERVICES } from '@/lib/services/catalog'

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
function IconUser() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function IconHome() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconGrid() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function _IconWorkflow() {
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
function IconStudio() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
}

const BOTTOM_NAV = [
  { path: '/', icon: IconHome, label: { en: 'Home', ka: 'მთავარი', ru: 'Главная' } },
  { path: '/services', icon: IconGrid, label: { en: 'Services', ka: 'სერვისები', ru: 'Сервисы' } },
  { path: '/hub', icon: IconStudio, label: { en: 'Studio', ka: 'სტუდია', ru: 'Студия' } },
  { path: '/services/agent-g', icon: IconChat, label: { en: 'Agent G', ka: 'Agent G', ru: 'Агент G' } },
] as const

/* ═══════════════════════════════════════════════════════════════════
   TopNavbar — modern, clean, theme-aware
   ═══════════════════════════════════════════════════════════════════ */
export function TopNavbar({ onMenuToggle, menuOpen }: { onMenuToggle: () => void; menuOpen: boolean }) {
  const { language: locale, setLanguage, t } = useLanguage()
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
    <>
    <nav
      className={`fixed top-0 inset-x-0 z-[200] flex flex-col transition-all duration-300`}
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderBottom: '1px solid var(--nav-border)',
        backdropFilter: 'blur(28px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2), 0 0 40px rgba(34,211,238,0.02)',
      }}
    >
      {/* Safe-area spacer for notch/dynamic island */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />
      <div className={`flex items-center justify-between px-4 sm:px-6 transition-all duration-300 ${scrolled ? 'h-14' : 'h-16'}`}>
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

      {/* Center: Command bar (desktop) */}
      <div className="hidden md:flex items-center flex-1 max-w-lg mx-8 relative">
        <div
          className="w-full flex items-center gap-2.5 rounded-xl px-4 py-2.5 transition-all duration-200"
          style={{
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
          }}
        >
          <span style={{ color: 'var(--color-accent)' }}><IconSearch /></span>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            placeholder={
              locale === 'ka' ? 'ჰკითხე Agent G-ს რისი შექმნა გინდა...' :
              locale === 'ru' ? 'Спросите Agent G, что создать...' :
              'Ask Agent G what to create…'
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
          className="md:hidden p-2.5 rounded-xl transition-colors hover:bg-[var(--card-hover)] active:scale-95"
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

        {/* Studio CTA */}
        <Link
          href={lh('/hub')}
          className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-xl transition-all duration-200 hover:scale-105"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(99,102,241,0.15))', color: 'var(--color-accent)', border: '1px solid rgba(34,211,238,0.25)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
          Studio
        </Link>

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
          className="cinematic-btn cinematic-btn-primary text-[13px] px-4 py-2.5 rounded-xl"
        >
          {locale === 'ka' ? 'დაწყება' : locale === 'ru' ? 'Начать' : 'Get Started'}
        </Link>
      </div>
      </div>
    </nav>

    {/* Mobile search overlay */}
    {searchOpen && (
      <div className="fixed inset-x-0 top-0 z-[201] md:hidden mobile-search-overlay" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="px-3 pt-2 pb-3" style={{ backgroundColor: 'var(--nav-bg)', backdropFilter: 'blur(20px) saturate(1.2)', WebkitBackdropFilter: 'blur(20px) saturate(1.2)', borderBottom: '1px solid var(--nav-border)' }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
              <span style={{ color: 'var(--color-accent)' }}><IconSearch /></span>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  locale === 'ka' ? 'ჰკითხე Agent G-ს...' :
                  locale === 'ru' ? 'Спросите Agent G...' :
                  'Ask Agent G…'
                }
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-text)', border: 'none', boxShadow: 'none' }}
                autoFocus
              />
            </div>
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              className="p-2.5 rounded-xl transition-colors hover:bg-[var(--card-hover)]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <IconX />
            </button>
          </div>
          {/* Mobile search results */}
          {filtered.length > 0 && (
            <div className="mt-2 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {filtered.slice(0, 6).map(s => (
                <button
                  key={s.slug}
                  onMouseDown={() => handleSearchSelect(s.slug)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--card-hover)] active:bg-[var(--card-hover)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span className="text-base">{s.icon}</span>
                  {s.title[locale as 'ka' | 'en' | 'ru'] || s.title.en}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Backdrop */}
        <div className="fixed inset-0 -z-10" onClick={() => { setSearchOpen(false); setSearchQuery('') }} />
      </div>
    )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SidebarMenu — modern slide-out panel
   ═══════════════════════════════════════════════════════════════════ */
export function SidebarMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language: locale, setLanguage } = useLanguage()
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
          borderRight: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          boxShadow: '4px 0 40px rgba(0,0,0,0.3), 0 0 60px rgba(34,211,238,0.02)',
          backdropFilter: 'blur(24px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-16 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <BrandLogo size="nav" showText compact={false} />
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--card-hover)] transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
            <IconX />
          </button>
        </div>

        {/* Navigation — Simplified */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
          {/* Agent G — Primary CTA */}
          <Link
            href={lh('/services/agent-g')}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-semibold transition-all duration-200"
            style={{
              color: isActive('/services/agent-g') ? '#fff' : 'var(--color-accent)',
              backgroundColor: isActive('/services/agent-g') ? 'var(--color-accent)' : 'var(--color-accent-soft)',
              border: `1px solid ${isActive('/services/agent-g') ? 'var(--color-accent)' : 'rgba(34,211,238,0.15)'}`,
            }}
          >
            <span className="text-lg">🤖</span>
            Agent G
          </Link>

          {/* AI Studio Hub */}
          <Link
            href={lh('/hub')}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-semibold transition-all duration-200"
            style={{
              color: isActive('/hub') ? '#fff' : 'var(--color-accent)',
              backgroundColor: isActive('/hub') ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.06)',
              border: `1px solid ${isActive('/hub') ? 'rgba(34,211,238,0.3)' : 'rgba(34,211,238,0.1)'}`,
            }}
          >
            <span className="text-lg">⚡</span>
            {locale === 'ka' ? 'AI სტუდია' : locale === 'ru' ? 'AI Студия' : 'AI Studio'}
          </Link>

          {/* All Services */}
          <Link
            href={lh('/services')}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-200"
            style={{
              color: isActive('/services') ? 'var(--color-text)' : 'var(--color-text-secondary)',
              backgroundColor: isActive('/services') ? 'var(--color-accent-soft)' : 'transparent',
            }}
          >
            <span className="text-lg">📋</span>
            {locale === 'ka' ? 'ყველა სერვისი' : locale === 'ru' ? 'Все сервисы' : 'All Services'}
          </Link>

          <div className="h-px my-3" style={{ backgroundColor: 'var(--color-border)' }} />

          {/* Pricing */}
          <Link
            href={lh('/pricing')}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-200"
            style={{
              color: isActive('/pricing') ? 'var(--color-text)' : 'var(--color-text-secondary)',
              backgroundColor: isActive('/pricing') ? 'var(--color-accent-soft)' : 'transparent',
            }}
          >
            <span className="text-lg">💰</span>
            {locale === 'ka' ? 'ფასები' : locale === 'ru' ? 'Цены' : 'Pricing'}
          </Link>
        </div>

        {/* Bottom section — settings */}
        <div className="shrink-0 px-3 pb-4 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
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

          {/* Settings */}
          <Link
            href={lh('/settings')}
            onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors hover:bg-[var(--card-hover)]"
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors hover:bg-[var(--card-hover)]"
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
        backdropFilter: 'blur(28px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.2), 0 0 40px rgba(34,211,238,0.02)',
      }}
    >
      {BOTTOM_NAV.map(item => {
        const Icon = item.icon
        const active = isActive(item.path)
        return (
          <Link
            key={item.path}
            href={lh(item.path)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-4 min-w-[56px] min-h-[44px] rounded-lg transition-colors active:scale-95"
            style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
          >
            <Icon />
            <span className="text-[11px] font-medium">
              {item.label[locale as keyof typeof item.label] || item.label.en}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
