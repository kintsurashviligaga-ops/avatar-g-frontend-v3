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
      <div
        className="max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Preview image if available */}
        {message.previewUrl && (
          <div className="relative h-40 sm:h-48 overflow-hidden">
            <img
              src={message.previewUrl}
              alt={message.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}

        <div className="p-4">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-lg">{icon}</span>
            <h4 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {message.title}
            </h4>
          </div>

          {/* Description */}
          {message.description && (
            <p className="text-xs sm:text-sm mb-3 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
              {message.description}
            </p>
          )}

          {/* Action buttons */}
          {message.actions && message.actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {message.actions.map((action, i) => (
                <button
                  key={i}
                  className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all active:scale-[0.97]"
                  style={{
                    backgroundColor: i === 0 ? 'var(--color-accent)' : 'transparent',
                    color: i === 0 ? '#fff' : 'var(--color-accent)',
                    border: i === 0 ? 'none' : '1px solid var(--color-border)',
                  }}
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
