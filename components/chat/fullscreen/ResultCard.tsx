'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, type ChatLocale } from './config'
import type { FCResultMessage } from './types'

interface Props {
  message: FCResultMessage
}

const TYPE_ICONS: Record<string, string> = {
  avatar: '🧑‍🎨',
  image: '🖼️',
  video: '🎬',
  music: '🎵',
  text: '✍️',
  workflow: '⚡',
}

export function ResultCard({ message }: Props) {
  const { language } = useLanguage()
  const lang = (language as ChatLocale) || 'en'
  const labels = CHAT_LABELS[lang] || CHAT_LABELS.en
  const icon = TYPE_ICONS[message.resultType] || '📦'

  return (
    <div className="flex justify-start">
      <div className="chat-result-card">
        {message.previewUrl && (
          <div className="relative h-40 sm:h-48 overflow-hidden">
            <img src={message.previewUrl} alt={message.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-lg">{icon}</span>
            <h4 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--color-text)' }}>{message.title}</h4>
          </div>
          {message.description && (
            <p className="text-xs sm:text-sm mb-3 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{message.description}</p>
          )}
          {message.actions && message.actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {message.actions.map((action, i) => (
                <button key={i}
                  className={i === 0 ? 'chat-send-btn' : 'chat-transfer-btn'}
                  style={i === 0 ? { width: 'auto', padding: '6px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '10px' } : undefined}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
