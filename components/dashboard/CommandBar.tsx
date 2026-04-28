'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Zap } from 'lucide-react'
import { UI_SERVICES } from '@/lib/services/uiCatalog'

interface CommandBarProps {
  onServiceSelect?: (serviceId: string) => void
}

export function CommandBar({ onServiceSelect }: CommandBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = query.trim()
    ? UI_SERVICES.filter(s =>
        s.keywords.some(k => k.includes(query.toLowerCase())) ||
        s.label.toLowerCase().includes(query.toLowerCase())
      )
    : UI_SERVICES

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 50)
    }
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    }
  }, [open])

  const handleSelect = (id: string) => {
    onServiceSelect?.(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <>
      {/* ── Trigger button ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-all hover:bg-white/8"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline text-xs">სერვისის ძიება...</span>
        <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed left-1/2 top-[15vh] z-[201] w-full max-w-xl -translate-x-1/2 rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(15,15,26,0.98)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
              }}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/6">
                <Search className="w-4 h-4 text-white/35 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="სერვისის ძიება..."
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/25"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
                  Esc
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[60vh] overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-white/30 py-8">შედეგი ვერ მოიძებნა</p>
                ) : (
                  <>
                    {!query && (
                      <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                        ყველა სერვისი
                      </p>
                    )}
                    <div className="px-2 space-y-0.5">
                      {filtered.map(svc => {
                        const Icon = svc.icon
                        return (
                          <button
                            key={svc.id}
                            onClick={() => handleSelect(svc.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-white/6 group"
                          >
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: `${svc.color}18`, border: `1px solid ${svc.color}30` }}>
                              <Icon className="w-4 h-4" style={{ color: svc.color }} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white/85 group-hover:text-white transition-colors truncate">
                                {svc.label}
                              </p>
                              <p className="text-[11px] text-white/35 truncate">{svc.description}</p>
                            </div>
                            <Zap className="w-3.5 h-3.5 text-white/15 ml-auto flex-shrink-0 group-hover:text-white/40 transition-colors" />
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-white/6 flex items-center gap-4 text-[10px] text-white/25">
                <span>↑↓ navigate</span>
                <span>↵ select</span>
                <span>Esc close</span>
                <span className="ml-auto flex items-center gap-1">
                  <Zap className="w-3 h-3" /> {UI_SERVICES.length} სერვისი
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
