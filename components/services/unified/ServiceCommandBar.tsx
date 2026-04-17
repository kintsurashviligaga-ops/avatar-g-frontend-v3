'use client'

/**
 * ServiceCommandBar — Cmd+K command palette for quick service switching.
 *
 * Features:
 * - Fuzzy search across service names (all 3 languages)
 * - Keyboard navigation (arrows + enter)
 * - Recent services memory (sessionStorage)
 * - Grouped results: recent, then all matches
 *
 * Neo-Cosmic: centered modal, glass background, cyan focus ring.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ServiceItem {
  slug: string
  title: string
  name: string
  icon: string
  description: string
  enabled: boolean
}

interface ServiceCommandBarProps {
  open: boolean
  onClose: () => void
  services: ServiceItem[]
  activeServiceId: string
  onServiceSelect: (slug: string) => void
  locale: string
}

const RECENT_KEY = 'myavatar-recent-services'
const MAX_RECENT = 5

export function ServiceCommandBar({
  open,
  onClose,
  services,
  activeServiceId,
  onServiceSelect,
  locale,
}: ServiceCommandBarProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const lang = locale as 'en' | 'ka' | 'ru'

  // Recent services from sessionStorage
  const [recentSlugs, setRecentSlugs] = useState<string[]>([])
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(RECENT_KEY)
      if (stored) setRecentSlugs(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [open])

  const addRecent = useCallback((slug: string) => {
    setRecentSlugs(prev => {
      const next = [slug, ...prev.filter(s => s !== slug)].slice(0, MAX_RECENT)
      try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  // Filter services
  const enabledServices = useMemo(
    () => services.filter(s => s.enabled && s.slug !== 'next'),
    [services]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return enabledServices
    const q = query.toLowerCase()
    return enabledServices.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.slug.includes(q) ||
      s.description.toLowerCase().includes(q)
    )
  }, [query, enabledServices])

  // Build display list: recent header + recent, then all/results
  const displayList = useMemo(() => {
    if (query.trim()) return filtered.map(s => ({ ...s, section: 'results' as const }))

    const recentItems = recentSlugs
      .map(slug => enabledServices.find(s => s.slug === slug))
      .filter(Boolean) as ServiceItem[]

    const rest = enabledServices.filter(s => !recentSlugs.includes(s.slug))

    return [
      ...recentItems.map(s => ({ ...s, section: 'recent' as const })),
      ...rest.map(s => ({ ...s, section: 'all' as const })),
    ]
  }, [query, filtered, recentSlugs, enabledServices])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, displayList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && displayList[selectedIdx]) {
      e.preventDefault()
      const item = displayList[selectedIdx]
      addRecent(item.slug)
      onServiceSelect(item.slug)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [displayList, selectedIdx, onServiceSelect, onClose, addRecent])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  // Clamp selectedIdx
  useEffect(() => {
    setSelectedIdx(i => Math.min(i, Math.max(0, displayList.length - 1)))
  }, [displayList.length])

  const T = {
    placeholder: { en: 'Search services...', ka: 'სერვისის ძებნა...', ru: 'Поиск сервисов...' },
    recent: { en: 'Recent', ka: 'ბოლო', ru: 'Недавние' },
    all: { en: 'All Services', ka: 'ყველა სერვისი', ru: 'Все сервисы' },
    results: { en: 'Results', ka: 'შედეგები', ru: 'Результаты' },
    noResults: { en: 'No services found', ka: 'სერვისი ვერ მოიძებნა', ru: 'Сервисы не найдены' },
    hint: { en: 'Navigate', ka: 'ნავიგაცია', ru: 'Навигация' },
    select: { en: 'Select', ka: 'არჩევა', ru: 'Выбрать' },
    close: { en: 'Close', ka: 'დახურვა', ru: 'Закრытие' },
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[10000]"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed z-[10001] top-[15vh] left-1/2 -translate-x-1/2 w-[90vw] max-w-[520px] rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(10,14,28,0.97)',
              border: '1px solid rgba(0,212,255,0.12)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.08)',
            }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(0,212,255,0.6)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
                onKeyDown={handleKeyDown}
                placeholder={T.placeholder[lang] || T.placeholder.en}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
                style={{ color: '#f8fafc' }}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2 scrollbar-none">
              {displayList.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>{T.noResults[lang] || T.noResults.en}</p>
                </div>
              ) : (
                <>
                  {displayList.map((item, idx) => {
                    // Section headers
                    const prevSection = idx > 0 ? displayList[idx - 1]?.section ?? null : null
                    const showHeader = item.section !== prevSection

                    return (
                      <div key={item.slug}>
                        {showHeader && (
                          <div className="px-4 pt-2 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.35)' }}>
                              {item.section === 'recent'
                                ? (T.recent[lang] || T.recent.en)
                                : item.section === 'results'
                                  ? (T.results[lang] || T.results.en)
                                  : (T.all[lang] || T.all.en)}
                            </span>
                          </div>
                        )}
                        <button
                          data-idx={idx}
                          onClick={() => {
                            addRecent(item.slug)
                            onServiceSelect(item.slug)
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors duration-100"
                          style={{
                            background: idx === selectedIdx ? 'rgba(0,212,255,0.08)' : 'transparent',
                          }}
                          onMouseEnter={() => setSelectedIdx(idx)}
                        >
                          <div
                            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                            style={{
                              fontSize: 18,
                              background: item.slug === activeServiceId ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                              border: item.slug === activeServiceId ? '1px solid rgba(0,212,255,0.2)' : '1px solid rgba(255,255,255,0.04)',
                            }}
                          >
                            {item.icon}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium truncate" style={{ color: item.slug === activeServiceId ? '#00d4ff' : '#f8fafc' }}>
                              {item.title}
                            </div>
                            <div className="text-xs truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>
                              {item.description}
                            </div>
                          </div>
                          {item.slug === activeServiceId && (
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#00d4ff', boxShadow: '0 0 6px rgba(0,212,255,0.5)' }} />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-center gap-4 px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>↑↓</kbd>
                <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>{T.hint[lang] || T.hint.en}</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>↵</kbd>
                <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>{T.select[lang] || T.select.en}</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>esc</kbd>
                <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>{T.close[lang] || T.close.en}</span>
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
