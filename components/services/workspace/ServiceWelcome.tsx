'use client'

/**
 * ServiceWelcome — Shown when the service chat has no messages yet.
 * Displays service icon, name, hint, quick actions, tools preview,
 * and a link to open Agent G as the platform control center.
 */

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useServiceContext } from '@/lib/services/ServiceContext'
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
  const { recentOutputs } = useServiceContext()

  const hint = config.welcomeHint[lang] || config.welcomeHint.en
  const output = config.outputLabel[lang] || config.outputLabel.en

  // Check if user has recent outputs from other services that could be used here
  const hasTransferableInputs = recentOutputs.length > 0

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 text-center">
      {/* Service icon */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
        style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0.04) 100%)',
          border: '1px solid rgba(34,211,238,0.12)',
          boxShadow: '0 0 24px rgba(34,211,238,0.05)',
        }}
      >
        {serviceIcon}
      </div>

      {/* Service name */}
      <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
        {serviceName}
      </h2>

      {/* Hint */}
      <p className="text-[13px] max-w-[280px] leading-relaxed mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        {hint}
      </p>

      {/* Output label */}
      <p className="text-[11px] mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        {lang === 'ka' ? 'გამოსავალი' : lang === 'ru' ? 'Вывод' : 'Output'}: {output}
      </p>

      {/* Transferable inputs notice */}
      {hasTransferableInputs && (
        <div
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl mb-5 max-w-sm w-full"
          style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.1)' }}
        >
          <span className="text-sm">📎</span>
          <span className="text-[11px] font-medium" style={{ color: 'rgba(34,211,238,0.8)' }}>
            {lang === 'ka' ? `${recentOutputs.length} მზა შედეგი სხვა სერვისებიდან` : lang === 'ru' ? `${recentOutputs.length} результатов из других сервисов` : `${recentOutputs.length} output${recentOutputs.length > 1 ? 's' : ''} from other services available`}
          </span>
        </div>
      )}

      {/* Quick actions grid */}
      {config.quickActions.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {lang === 'ka' ? 'სწრაფი მოქმედებები' : lang === 'ru' ? 'Быстрые действия' : 'Quick Actions'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {config.quickActions.slice(0, 6).map((qa) => {
              const qaLabel = qa.label[lang] || qa.label.en
              return (
                <button
                  key={qa.id}
                  onClick={() => onSend(qa.prompt)}
                  className="group flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl transition-all duration-200 active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-xl">{qa.icon}</span>
                  <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--color-text-secondary)' }}>
                    {qaLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tools + Agent G bar */}
      <div className="mt-5 flex items-center gap-3">
        {config.tools.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--color-accent)', opacity: 0.5 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0.73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            </svg>
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {config.tools.length} {lang === 'ka' ? 'ხელსაწყო' : lang === 'ru' ? 'инструментов' : 'tools'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.08)' }}>
          <span className="text-xs">🤖</span>
          <span className="text-[10px] font-medium" style={{ color: 'rgba(34,211,238,0.7)' }}>
            Agent G
          </span>
        </div>
      </div>
    </div>
  )
}
