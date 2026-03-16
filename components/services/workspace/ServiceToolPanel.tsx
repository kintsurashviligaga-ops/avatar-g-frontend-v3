'use client'

/**
 * ServiceToolPanel — Collapsible tool controls area above composer.
 * Each service has its own tools: selects, uploads, toggles.
 */

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { ServiceTool } from '@/lib/services/workspace-config'

type LocaleKey = 'en' | 'ka' | 'ru'

interface ServiceToolPanelProps {
  tools: ServiceTool[]
  values: Record<string, string>
  onChange: (toolId: string, value: string) => void
  onUpload: () => void
  onCamera: () => void
}

export function ServiceToolPanel({ tools, values, onChange, onUpload, onCamera }: ServiceToolPanelProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'
  const [expanded, setExpanded] = useState(false)

  if (tools.length === 0) return null

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-[12px] font-medium transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{lang === 'ka' ? 'ხელსაწყოები' : lang === 'ru' ? 'Инструменты' : 'Tools'}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(34,211,238,0.1)', color: 'var(--color-accent)' }}>
            {tools.length}
          </span>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Tool controls */}
      {expanded && (
        <div className="px-3.5 pb-3 space-y-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {tools.map(tool => {
            const label = tool.label[lang] || tool.label.en

            if (tool.type === 'select' && tool.options) {
              return (
                <div key={tool.id} className="space-y-1.5">
                  <label className="text-[11px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>{tool.icon}</span> {label}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {tool.options.map(opt => {
                      const isActive = (values[tool.id] || tool.defaultValue) === opt.value
                      const optLabel = opt.label[lang] || opt.label.en
                      return (
                        <button
                          key={opt.value}
                          onClick={() => onChange(tool.id, opt.value)}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg transition-all font-medium"
                          style={isActive
                            ? { backgroundColor: 'var(--color-accent)', color: '#000', border: '1px solid var(--color-accent)' }
                            : { backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }
                          }
                        >
                          {optLabel}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            }

            if (tool.type === 'upload') {
              return (
                <button
                  key={tool.id}
                  onClick={onUpload}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors w-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span>{tool.icon}</span> {label}
                </button>
              )
            }

            if (tool.type === 'camera') {
              return (
                <button
                  key={tool.id}
                  onClick={onCamera}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors w-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span>{tool.icon}</span> {label}
                </button>
              )
            }

            if (tool.type === 'toggle') {
              const isOn = values[tool.id] === 'on'
              return (
                <button
                  key={tool.id}
                  onClick={() => onChange(tool.id, isOn ? 'off' : 'on')}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors w-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="flex items-center gap-2">
                    <span>{tool.icon}</span> {label}
                  </span>
                  <div
                    className="w-8 h-4.5 rounded-full transition-colors relative"
                    style={{ backgroundColor: isOn ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)' }}
                  >
                    <div
                      className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform"
                      style={{ transform: isOn ? 'translateX(14px)' : 'translateX(2px)' }}
                    />
                  </div>
                </button>
              )
            }

            return null
          })}
        </div>
      )}
    </div>
  )
}
