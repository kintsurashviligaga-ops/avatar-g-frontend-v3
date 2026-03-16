'use client'

/**
 * ServiceWelcome — Shown when the service chat has no messages yet.
 * Displays service icon, name, description, hint, and quick actions.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { ServiceWorkspaceConfig } from '@/lib/services/workspace-config'

type LocaleKey = 'en' | 'ka' | 'ru'

interface ServiceWelcomeProps {
  config: ServiceWorkspaceConfig
  serviceName: string
  serviceIcon: string
  onSend: (text: string) => void
}

export function ServiceWelcome({ config, serviceName, serviceIcon, onSend }: ServiceWelcomeProps) {
  const { language } = useLanguage()
  const lang = (language as LocaleKey) || 'en'

  const hint = config.welcomeHint[lang] || config.welcomeHint.en
  const output = config.outputLabel[lang] || config.outputLabel.en

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 text-center">
      {/* Service icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5"
        style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0.05) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}
      >
        {serviceIcon}
      </div>

      {/* Service name */}
      <h2 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
        {serviceName}
      </h2>

      {/* Hint */}
      <p className="text-[13px] max-w-[280px] leading-relaxed mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        {hint}
      </p>

      {/* Output label */}
      <p className="text-[11px] mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
        {lang === 'ka' ? 'გამოსავალი' : lang === 'ru' ? 'Вывод' : 'Output'}: {output}
      </p>

      {/* Quick actions grid */}
      {config.quickActions.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {lang === 'ka' ? 'სწრაფი მოქმედებები' : lang === 'ru' ? 'Быстрые действия' : 'Quick Actions'}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {config.quickActions.slice(0, 4).map((qa) => {
              const qaLabel = qa.label[lang] || qa.label.en
              return (
                <button
                  key={qa.id}
                  onClick={() => onSend(qa.prompt)}
                  className="group flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-lg">{qa.icon}</span>
                  <span className="text-[12px] font-medium flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {qaLabel}
                  </span>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="opacity-0 group-hover:opacity-60 transition-opacity"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
