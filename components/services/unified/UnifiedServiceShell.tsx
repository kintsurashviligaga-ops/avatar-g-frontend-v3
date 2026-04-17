'use client'

/**
 * UnifiedServiceShell — "One Window" experience for all 19 services.
 *
 * Provides:
 * - Persistent left sidebar orbit dock (service switcher)
 * - Top bar with active service identity + command bar trigger
 * - Content area that renders the active service workspace
 * - Cmd+K / Ctrl+K command palette for quick service switching
 * - Mobile-first: dock collapses to bottom rail on small screens
 *
 * Neo-Cosmic Futurism design: glassmorphism, neon accents, smooth transitions.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SERVICE_REGISTRY, getLocalizedServices } from '@/lib/service-registry'
import { ServiceOrbitDock } from './ServiceOrbitDock'
import { ServiceCommandBar } from './ServiceCommandBar'
import { ServiceTopBar } from './ServiceTopBar'
import { ShellContainerProvider } from './ShellContainerContext'

type LocaleKey = 'en' | 'ka' | 'ru'

interface UnifiedServiceShellProps {
  activeServiceId: string
  locale: string
  children: React.ReactNode
}

export function UnifiedServiceShell({ activeServiceId, locale, children }: UnifiedServiceShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'

  const [dockExpanded, setDockExpanded] = useState(false)
  const [commandBarOpen, setCommandBarOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const services = getLocalizedServices(lang)
  const activeService = services.find(s => s.slug === activeServiceId)

  // Hydration guard
  useEffect(() => { setIsMounted(true) }, [])

  // Cmd+K / Ctrl+K to open command bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandBarOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setCommandBarOpen(false)
        setDockExpanded(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleServiceSwitch = useCallback((slug: string) => {
    setCommandBarOpen(false)
    setDockExpanded(false)
    const basePath = `/${lang}/services/${slug}`
    if (pathname !== basePath) {
      router.push(basePath)
    }
  }, [lang, pathname, router])

  if (!isMounted) return null

  return (
    <div className="fixed inset-0 flex z-[100]" style={{ height: '100dvh', background: '#0a0a0f' }}>
      {/* ── Left: Orbit Dock (desktop) ── */}
      <ServiceOrbitDock
        services={services}
        activeServiceId={activeServiceId}
        expanded={dockExpanded}
        onToggleExpand={() => setDockExpanded(v => !v)}
        onServiceSelect={handleServiceSwitch}
        locale={lang}
      />

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <ServiceTopBar
          activeService={activeService}
          onCommandBar={() => setCommandBarOpen(true)}
          onDockToggle={() => setDockExpanded(v => !v)}
          locale={lang}
        />

        {/* Content */}
        <main ref={contentRef} className="flex-1 min-h-0 relative overflow-hidden">
          <ShellContainerProvider containerRef={contentRef}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeServiceId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </ShellContainerProvider>
        </main>

        {/* ── Bottom: Mobile Orbit Rail ── */}
        <MobileServiceRail
          services={services}
          activeServiceId={activeServiceId}
          onServiceSelect={handleServiceSwitch}
        />
      </div>

      {/* ── Command Bar Overlay ── */}
      <ServiceCommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        services={services}
        activeServiceId={activeServiceId}
        onServiceSelect={handleServiceSwitch}
        locale={lang}
      />
    </div>
  )
}

/* ── Mobile bottom rail ── */
function MobileServiceRail({
  services,
  activeServiceId,
  onServiceSelect,
}: {
  services: typeof SERVICE_REGISTRY
  activeServiceId: string
  onServiceSelect: (slug: string) => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll to active service
  useEffect(() => {
    if (activeRef.current && railRef.current) {
      const rail = railRef.current
      const btn = activeRef.current
      const offset = btn.offsetLeft - rail.clientWidth / 2 + btn.clientWidth / 2
      rail.scrollTo({ left: offset, behavior: 'smooth' })
    }
  }, [activeServiceId])

  return (
    <div
      className="md:hidden shrink-0 relative"
      style={{
        background: 'rgba(6,8,18,0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(0,212,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Glow line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent)' }} />

      <div
        ref={railRef}
        className="flex items-center gap-1 px-2 py-2 overflow-x-auto scrollbar-none"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {services.filter(s => s.enabled && s.slug !== 'next').map(s => {
          const isActive = s.slug === activeServiceId
          return (
            <button
              key={s.slug}
              ref={isActive ? activeRef : undefined}
              onClick={() => onServiceSelect(s.slug)}
              className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl shrink-0 transition-all duration-200"
              style={{
                background: isActive ? 'rgba(0,212,255,0.12)' : 'transparent',
                border: isActive ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
                minWidth: 56,
              }}
            >
              <span className="text-base leading-none">{s.icon}</span>
              <span
                className="text-[10px] leading-tight truncate max-w-[52px]"
                style={{ color: isActive ? '#00d4ff' : 'rgba(148,163,184,0.7)' }}
              >
                {s.title}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
