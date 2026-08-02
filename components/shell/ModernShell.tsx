'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { SERVICES } from '@/lib/services/catalog'
import { useDialogA11y } from '@/hooks/useDialogA11y'

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
function _IconHome() {
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
/* ⚠️ THE BAR HAD TWO ICONS A USER COULD NOT TELL APART. IconGrid (rx=1) and IconStudio (rx=1.5) are the
   same four rectangles at the same coordinates, differing by half a pixel of corner radius — and they sat
   side by side in the bottom bar pointing at two unrelated places. "Two of the icons look the same" was
   literally true. These two are deliberately different SHAPES, not different radii: a stack of images and
   a life-ring read apart at 20px. */
function IconLibrary() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="11.5" r="1.2"/><path d="m3 16 3.5-3.5 3 3L13 12l4 4"/></svg>
}
function IconSupport() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.7 5.7 3.8 3.8M14.5 14.5l3.8 3.8M18.3 5.7l-3.8 3.8M9.5 14.5l-3.8 3.8"/></svg>
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
function _IconStudio() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
}

/**
 * ⚠️ ONE SOURCE OF TRUTH FOR ALL THREE NAV SURFACES. The header, the burger drawer and the bottom bar
 * each carried their own hand-written list, and they had drifted apart on almost every item:
 *   · /hub was labelled "Studio" (hardcoded English, even on ka/ru) in the header, "AI სტუდია" in the
 *     drawer and "სტუდია" in the bottom bar — ONE destination wearing three different names, one of
 *     which was not translated at all in a Georgian-primary product.
 *   · Pricing existed only inside the burger drawer. A desktop visitor had no path to the page that
 *     takes their money without first opening a mobile-style menu.
 * Labels and paths live here; each surface still owns its own presentation. That is the part that
 * actually drifts — three hardcoded copies of the same string cannot stay in agreement by hand.
 */
/**
 * ⚠️ AND THE ITEMS THEMSELVES WENT TO THE WRONG PLACES — reported twice, from a phone, as "when I press
 * the icons at the bottom it opens something completely different". Verified by clicking each one:
 *   · "მთავარი" -> `/ka` -> redirect -> /ka/dashboard          = the chat
 *   · "Agent G" -> /ka/services/agent-g -> redirect -> /ka/dashboard#agent = the SAME chat.
 *     Two of four icons landed on one page, differing only by a hash.
 *   · "სტუდია" -> /ka/hub = a SEPARATE application (AiHubShell) with its own header and sidebar,
 *     hardcoded English on a /ka route, and no link back to the product.
 *   · "სერვისები" -> /ka/services = a logged-out marketing funnel ("შენი AI ქარხანა", Get Started Free).
 * Three of those four also match AppShell's `isImmersiveWorkspace`, so the bar DELETED ITSELF on arrival
 * and left no way back. A previous attempt fixed a LABEL, which is why nothing the user could feel changed.
 *
 * THE BAR ONLY EVER RENDERS ON THE PERIPHERAL PAGES — legal, pricing, settings, support — which is exactly
 * where they were (/ka/terms, /ka/refund). So its job is "take me back to my work, my files, my account, or
 * a human". Four real pages, four distinct icons, no redirect hops, and two of the four keep the bar so a
 * mis-tap is recoverable.
 *
 * /hub and /services stay LIVE ROUTES on purpose — app/sitemap.ts indexes them for SEO — they are simply
 * no longer presented as in-app navigation.
 */
const NAV_ITEMS = [
  { path: '/dashboard', icon: IconChat,     emoji: '💬', label: { en: 'Chat',      ka: 'ჩატი',          ru: 'Чат' },       surfaces: ['bottom', 'drawer', 'header'] },
  { path: '/library',   icon: IconLibrary,  emoji: '🖼', label: { en: 'Library',   ka: 'ბიბლიოთეკა',    ru: 'Библиотека' }, surfaces: ['bottom', 'drawer'] },
  // NOT in the drawer: the drawer's own footer already carries a Settings row (with the locale switcher
  // and sign-in). Listing it here too rendered 'პარამეტრები' twice in one menu.
  { path: '/settings',  icon: IconSettings, emoji: '⚙',  label: { en: 'Settings',  ka: 'პარამეტრები',   ru: 'Настройки' },  surfaces: ['bottom'] },
  // 🛟 not 💬 — /dashboard already owns the speech bubble, and two drawer rows wearing the same glyph is
  // the same defect as the two identical grid icons, just in emoji form.
  { path: '/support',   icon: IconSupport,  emoji: '🛟', label: { en: 'Support',   ka: 'მხარდაჭერა',    ru: 'Поддержка' },  surfaces: ['bottom', 'drawer'] },
  { path: '/pricing',   icon: IconGrid,     emoji: '💰', label: { en: 'Pricing',   ka: 'ფასები',        ru: 'Цены' },       surfaces: ['drawer', 'header'] },
] as const

/**
 * The bottom bar keeps its own explicit order so it can never be reshuffled by an edit to NAV_ITEMS —
 * a thumb navigating by position rather than by reading is what a silent reorder breaks.
 * ⚠️ EVERY PATH HERE MUST EXIST IN NAV_ITEMS. `.find(...)!` hides a typo behind a non-null assertion and
 * the bar then crashes at runtime on `item.icon`.
 */
const BOTTOM_ORDER = ['/dashboard', '/library', '/settings', '/support'] as const
const BOTTOM_NAV = BOTTOM_ORDER.map((p) => NAV_ITEMS.find((i) => i.path === p)!)

const navLabel = (path: string, locale: string): string => {
  const item = NAV_ITEMS.find((i) => i.path === path)
  if (!item) return ''
  return item.label[(locale === 'en' || locale === 'ru' ? locale : 'ka')]
}

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

  // NOTE: focus-in is handled by useDialogA11y below (it focuses the first focusable
  // = the search input). We must NOT autoFocus/focus the input ourselves first, or the
  // hook would capture the input — not the trigger — as the focus-restore target.

  // Full-screen search is a modal: Escape-to-close + focus trap/restore + dialog
  // semantics (the twin of the drawer, which was already hardened with this hook).
  const closeSearch = () => { setSearchOpen(false); setSearchQuery('') }
  const searchDialogRef = useDialogA11y<HTMLDivElement>(searchOpen, closeSearch)
  // Lock body scroll while it's open so the page behind doesn't scroll under a drag.
  useEffect(() => {
    if (!searchOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [searchOpen])
  // Close on navigation (bottom nav / back gesture / any link) so the overlay never
  // lingers over a new route — the navbar persists across App Router transitions.
  useEffect(() => { setSearchOpen(false); setSearchQuery('') }, [pathname])

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
          className="p-2.5 rounded-lg transition-colors hover:bg-[var(--card-hover)] touch-manipulation"
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
          className="md:hidden flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-xl transition-colors hover:bg-[var(--card-hover)] active:scale-95 touch-manipulation"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label={locale === 'ka' ? 'ძებნა' : locale === 'ru' ? 'Поиск' : 'Search'}
          aria-expanded={searchOpen}
          aria-controls="mobile-search-overlay"
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

        {/* Pricing — was reachable ONLY from inside the burger drawer, so a desktop visitor had no route
            to the page that takes their money without opening a mobile-style menu first. */}
        <Link
          href={lh('/pricing')}
          className="hidden md:flex items-center text-[13px] font-medium px-3 py-2 rounded-lg transition-colors hover:bg-[var(--card-hover)]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {navLabel('/pricing', locale)}
        </Link>

        {/* The product CTA. It pointed at /hub — a separate application with its own chrome and no way
            back — so the most prominent button in the header led AWAY from the product. Now it opens the
            chat, and both the destination and the label come from NAV_ITEMS. */}
        <Link
          href={lh('/dashboard')}
          className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-xl transition-all duration-200 hover:scale-105"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(14,165,233,0.15))', color: 'var(--color-accent)', border: '1px solid rgba(34,211,238,0.25)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {navLabel('/dashboard', locale)}
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
      <div ref={searchDialogRef} id="mobile-search-overlay" role="dialog" aria-modal="true" aria-label={locale === 'ka' ? 'ძებნა' : locale === 'ru' ? 'Поиск' : 'Search'} className="fixed inset-x-0 top-0 z-[201] md:hidden mobile-search-overlay" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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

  // Lock body scroll while the drawer is open so the page behind it doesn't
  // scroll under a swipe on the panel/backdrop (a common mobile drawer bug).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape-to-close + focus trap/restore + dialog semantics (the panel had only
  // the scroll lock; keyboard/AT users could tab behind the z-260 overlay).
  const dialogRef = useDialogA11y<HTMLElement>(open, onClose);

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
        ref={dialogRef}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={locale === 'en' ? 'Menu' : locale === 'ru' ? 'Меню' : 'მენიუ'}
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
          {/* The logo is a home link in the top bar and in the bottom nav; here alone it was inert —
              BrandLogo only wraps itself in a <Link> when given an href. Tapping a brand mark to get home
              is universal, so the one surface where it silently did nothing was the mobile drawer. */}
          <BrandLogo href={lh('/')} size="nav" showText compact={false} />
          <button onClick={onClose} aria-label={locale === 'en' ? 'Close menu' : locale === 'ru' ? 'Закрыть меню' : 'მენიუს დახურვა'} className="p-2 rounded-lg hover:bg-[var(--card-hover)] transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
            <IconX />
          </button>
        </div>

        {/* ⚠️ THIS DRAWER USED TO HAND-WRITE ITS OWN FOUR LINKS — Agent G, /hub, /services, /pricing — each
            with its own hardcoded emoji, its own label, and its own copy of the destination. That is how it
            drifted out of agreement with the bottom bar and the header in the first place, and how it kept
            pointing at /hub and /services after those stopped being product surfaces. It now renders from
            NAV_ITEMS like every other surface, so a destination can only ever be wrong in ONE place. The
            first item keeps the accent-CTA treatment the drawer has always given its lead entry. */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
          {NAV_ITEMS.filter((i) => (i.surfaces as readonly string[]).includes('drawer')).map((item, i) => {
            const active = isActive(item.path)
            const lead = i === 0
            return (
              <Link
                key={item.path}
                href={lh(item.path)}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] transition-all duration-200 ${lead ? 'font-semibold' : 'font-medium'}`}
                style={
                  lead
                    ? {
                        color: active ? '#fff' : 'var(--color-accent)',
                        backgroundColor: active ? 'var(--color-accent)' : 'var(--color-accent-soft)',
                        border: `1px solid ${active ? 'var(--color-accent)' : 'rgba(34,211,238,0.15)'}`,
                      }
                    : {
                        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                      }
                }
              >
                <span className="text-lg">{item.emoji}</span>
                {navLabel(item.path, locale)}
              </Link>
            )
          })}
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
            style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          >
            <Icon />
            <span className="text-[11px] font-medium">
              {(('short' in item ? item.short : item.label) as Record<string, string>)[locale] || item.label.en}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
