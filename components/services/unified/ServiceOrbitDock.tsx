'use client'

/**
 * ServiceOrbitDock — Persistent left sidebar for service switching.
 *
 * Collapsed: 60px icon strip with tooltips
 * Expanded: 260px panel with labels, search, and categories
 * Hidden on mobile (replaced by bottom rail)
 *
 * Neo-Cosmic: glass background, cyan glow on active, smooth expand animation.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ServiceItem {
  slug: string
  title: string
  name: string
  icon: string
  enabled: boolean
}

interface ServiceOrbitDockProps {
  services: ServiceItem[]
  activeServiceId: string
  expanded: boolean
  onToggleExpand: () => void
  onServiceSelect: (slug: string) => void
  locale: string
}

/* ── Service category groupings ── */
const CATEGORIES: { key: string; label: Record<string, string>; slugs: string[] }[] = [
  {
    key: 'core',
    label: { en: 'Core AI', ka: 'ძირითადი AI', ru: 'Основной AI' },
    slugs: ['agent-g', 'workflow'],
  },
  {
    key: 'creative',
    label: { en: 'Creative Studio', ka: 'კრეატიული სტუდია', ru: 'Творческая студия' },
    slugs: ['avatar', 'image', 'photo', 'video', 'editing', 'music', 'media'],
  },
  {
    key: 'intelligence',
    label: { en: 'Intelligence', ka: 'ინტელექტი', ru: 'Интеллект' },
    slugs: ['text', 'prompt', 'visual-intel'],
  },
  {
    key: 'business',
    label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' },
    slugs: ['shop', 'business', 'software'],
  },
  {
    key: 'vertical',
    label: { en: 'Verticals', ka: 'ვერტიკალები', ru: 'Вертикали' },
    slugs: ['tourism', 'game', 'interior'],
  },
]

export function ServiceOrbitDock({
  services,
  activeServiceId,
  expanded,
  onToggleExpand,
  onServiceSelect,
  locale,
}: ServiceOrbitDockProps) {
  const [search, setSearch] = useState('')
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lang = locale as 'en' | 'ka' | 'ru'

  // When expanded, focus search
  useEffect(() => {
    if (expanded && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 200)
    }
    if (!expanded) setSearch('')
  }, [expanded])

  // Auto-scroll to active service in collapsed mode
  useEffect(() => {
    if (!expanded && activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeServiceId, expanded])

  const enabledServices = useMemo(
    () => services.filter(s => s.enabled && s.slug !== 'next'),
    [services]
  )

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return enabledServices.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.slug.includes(q)
    )
  }, [search, enabledServices])

  return (
    <motion.aside
      className="hidden md:flex flex-col shrink-0 relative z-30"
      animate={{ width: expanded ? 260 : 60 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        background: 'rgba(6,8,18,0.92)',
        backdropFilter: 'blur(24px) saturate(1.3)',
        borderRight: '1px solid rgba(0,212,255,0.06)',
      }}
    >
      {/* Glow accent line */}
      <div className="absolute top-0 right-0 bottom-0 w-px" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,212,255,0.15) 50%, transparent)' }} />

      {/* ── Toggle button ── */}
      <div className="flex items-center justify-center h-14 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={onToggleExpand}
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 group"
          style={{ background: 'rgba(255,255,255,0.04)' }}
          aria-label={expanded ? 'Collapse dock' : 'Expand dock'}
        >
          <motion.svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            style={{ color: 'rgba(148,163,184,0.8)' }}
          >
            <path d="m9 18 6-6-6-6" />
          </motion.svg>
        </button>
      </div>

      {/* ── Search (expanded only) ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 overflow-hidden"
          >
            <div className="py-2">
              <div
                className="flex items-center gap-2 px-2.5 h-8 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(148,163,184,0.5)', flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={lang === 'ka' ? 'ძებნა...' : lang === 'ru' ? 'Поиск...' : 'Search...'}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-500"
                  style={{ color: '#f8fafc' }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Service list ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-1">
        {filteredBySearch ? (
          /* Search results */
          <div className="px-1.5">
            {filteredBySearch.map(s => (
              <ServiceDockItem
                key={s.slug}
                service={s}
                active={s.slug === activeServiceId}
                expanded={expanded}
                hovered={hoveredSlug === s.slug}
                onSelect={() => onServiceSelect(s.slug)}
                onHover={setHoveredSlug}
                ref={s.slug === activeServiceId ? activeRef : undefined}
              />
            ))}
            {filteredBySearch.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'rgba(148,163,184,0.5)' }}>
                {lang === 'ka' ? 'ვერ მოიძებნა' : lang === 'ru' ? 'Не найдено' : 'No results'}
              </p>
            )}
          </div>
        ) : expanded ? (
          /* Categorized list */
          CATEGORIES.map(cat => {
            const items = cat.slugs.map(slug => enabledServices.find(s => s.slug === slug)).filter(Boolean) as ServiceItem[]
            if (items.length === 0) return null
            return (
              <div key={cat.key} className="mb-1">
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    {cat.label[lang] || cat.label.en}
                  </span>
                </div>
                <div className="px-1.5">
                  {items.map(s => (
                    <ServiceDockItem
                      key={s.slug}
                      service={s}
                      active={s.slug === activeServiceId}
                      expanded={expanded}
                      hovered={hoveredSlug === s.slug}
                      onSelect={() => onServiceSelect(s.slug)}
                      onHover={setHoveredSlug}
                      ref={s.slug === activeServiceId ? activeRef : undefined}
                    />
                  ))}
                </div>
              </div>
            )
          })
        ) : (
          /* Collapsed icon strip */
          <div className="px-1.5 space-y-0.5">
            {enabledServices.map(s => (
              <ServiceDockItem
                key={s.slug}
                service={s}
                active={s.slug === activeServiceId}
                expanded={false}
                hovered={hoveredSlug === s.slug}
                onSelect={() => onServiceSelect(s.slug)}
                onHover={setHoveredSlug}
                ref={s.slug === activeServiceId ? activeRef : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Keyboard hint (expanded) ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="shrink-0 px-3 py-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                ⌘K
              </kbd>
              <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>
                {lang === 'ka' ? 'სწრაფი გადართვა' : lang === 'ru' ? 'Быстрое переключение' : 'Quick switch'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

/* ── Single dock item ── */
import { forwardRef } from 'react'

interface ServiceDockItemProps {
  service: ServiceItem
  active: boolean
  expanded: boolean
  hovered: boolean
  onSelect: () => void
  onHover: (slug: string | null) => void
}

const ServiceDockItem = forwardRef<HTMLButtonElement, ServiceDockItemProps>(
  function ServiceDockItem({ service, active, expanded, hovered, onSelect, onHover }, ref) {
    return (
      <div className="relative">
        <button
          ref={ref}
          onClick={onSelect}
          onMouseEnter={() => onHover(service.slug)}
          onMouseLeave={() => onHover(null)}
          className="w-full flex items-center gap-2.5 rounded-xl transition-all duration-150 relative group"
          style={{
            padding: expanded ? '8px 10px' : '8px 0',
            justifyContent: expanded ? 'flex-start' : 'center',
            background: active ? 'rgba(0,212,255,0.08)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}
          aria-label={service.title}
          aria-current={active ? 'page' : undefined}
        >
          {/* Active indicator */}
          {active && (
            <motion.div
              layoutId="dock-active-indicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
              style={{
                height: 20,
                background: 'linear-gradient(180deg, #00d4ff, #0284c7)',
                boxShadow: '0 0 8px rgba(0,212,255,0.5)',
              }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}

          {/* Icon */}
          <div
            className="flex items-center justify-center shrink-0 rounded-lg transition-all duration-150"
            style={{
              width: 36,
              height: 36,
              fontSize: 18,
              background: active ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
              border: active ? '1px solid rgba(0,212,255,0.2)' : '1px solid rgba(255,255,255,0.04)',
              boxShadow: active ? '0 0 12px rgba(0,212,255,0.15)' : 'none',
            }}
          >
            {service.icon}
          </div>

          {/* Label (expanded only) */}
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[13px] font-medium truncate"
              style={{ color: active ? '#00d4ff' : '#e2e8f0' }}
            >
              {service.title}
            </motion.span>
          )}
        </button>

        {/* Tooltip (collapsed only, on hover) */}
        {!expanded && hovered && (
          <div
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg whitespace-nowrap z-50 pointer-events-none"
            style={{
              background: 'rgba(10,14,28,0.95)',
              border: '1px solid rgba(0,212,255,0.15)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: '#f8fafc' }}>{service.title}</span>
          </div>
        )}
      </div>
    )
  }
)
