'use client'

/**
 * ServiceHamburgerMenu — Slide-in service-specific side panel.
 * Content varies per service: menu items, presets, transfers.
 */

import { useEffect, useRef } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { ServiceWorkspaceConfig, ServiceMenuItem } from '@/lib/services/workspace-config'

type LocaleKey = 'en' | 'ka' | 'ru'

interface ServiceHamburgerMenuProps {
  open: boolean
  onClose: () => void
  config: ServiceWorkspaceConfig
  serviceName: string
  serviceIcon: string
  onMenuAction: (item: ServiceMenuItem) => void
}

export function ServiceHamburgerMenu({ open, onClose, config, serviceName, serviceIcon, onMenuAction }: ServiceHamburgerMenuProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 bottom-0 z-[9999] w-[300px] sm:w-[340px] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{
          backgroundColor: '#0c0c10',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.1))', border: '1px solid rgba(34,211,238,0.15)' }}
              >
                <span className="text-lg">{serviceIcon}</span>
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{serviceName}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {lang === 'ka' ? 'სერვისის მენიუ' : lang === 'ru' ? 'Меню сервиса' : 'Service Menu'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {config.menuItems.map((item) => {
              if (item.divider) {
                return <div key={item.id} className="my-2 mx-2 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
              }

              const label = item.label[lang] || item.label.en
              const isTransfer = item.action === 'transfer'

              return (
                <button
                  key={item.id}
                  onClick={() => { onMenuAction(item); onClose() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group"
                  style={{ color: isTransfer ? 'var(--color-accent)' : 'var(--color-text)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                >
                  <span className="text-base w-6 text-center shrink-0">{item.icon}</span>
                  <span className="text-[13px] font-medium">{label}</span>
                  {isTransfer && (
                    <svg className="ml-auto w-3.5 h-3.5 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer: Agent G link */}
          <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => {
                onMenuAction({ id: 'agent-g-main', icon: '🤖', label: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' }, action: 'transfer', target: 'agent-g' })
                onClose()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
              style={{ backgroundColor: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.1)', color: 'var(--color-accent)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(34,211,238,0.12)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(34,211,238,0.06)' }}
            >
              <span className="text-base">🤖</span>
              <div>
                <p className="text-[13px] font-semibold">Agent G</p>
                <p className="text-[10px] opacity-60">{lang === 'ka' ? 'ცენტრალური ორკესტრატორი' : lang === 'ru' ? 'Центральный оркестратор' : 'Central Orchestrator'}</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
