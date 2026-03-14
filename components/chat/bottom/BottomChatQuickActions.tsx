'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

export interface QuickAction {
  id: string
  icon: string
  label: { en: string; ka: string; ru: string }
  route?: string
  prompt?: string
}

const ACTIONS: QuickAction[] = [
  { id: 'avatar',   icon: '👤', label: { en: 'Create Avatar',    ka: 'ავატარი',         ru: 'Аватар'          }, route: '/services/avatar' },
  { id: 'video',    icon: '🎬', label: { en: 'Generate Video',   ka: 'ვიდეო',           ru: 'Видео'           }, route: '/services/video' },
  { id: 'image',    icon: '🖼️', label: { en: 'Create Image',     ka: 'სურათი',           ru: 'Изображение'     }, route: '/services/image' },
  { id: 'music',    icon: '🎵', label: { en: 'Generate Music',   ka: 'მუსიკა',           ru: 'Музыка'          }, route: '/services/music' },
  { id: 'workflow', icon: '⚡', label: { en: 'Build Workflow',   ka: 'ვორქფლოუ',        ru: 'Воркфлоу'        }, route: '/services/workflow' },
  { id: 'agent-g',  icon: '🤖', label: { en: 'Ask Agent G',      ka: 'Agent G',          ru: 'Agent G'         }, route: '/services/agent-g' },
  { id: 'text',     icon: '✍️', label: { en: 'Write Copy',       ka: 'ტექსტი',           ru: 'Текст'           }, route: '/services/text' },
  { id: 'explore',  icon: '🔍', label: { en: 'Explore Tools',    ka: 'ინსტრუმენტები',    ru: 'Инструменты'     }, route: '/services' },
]

interface Props {
  onAction: (action: QuickAction) => void
  /** landing = show fewer, app = show all */
  mode?: 'landing' | 'app'
}

export function BottomChatQuickActions({ onAction, mode = 'landing' }: Props) {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const items = mode === 'landing' ? ACTIONS.slice(0, 6) : ACTIONS

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
      {items.map(a => (
        <button
          key={a.id}
          onClick={() => onAction(a)}
          className="quick-action-chip group flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="text-sm transition-transform duration-300 group-hover:scale-110">{a.icon}</span>
          <span className="transition-colors duration-200 group-hover:text-[var(--color-accent)]">
            {a.label[lang] || a.label.en}
          </span>
        </button>
      ))}
    </div>
  )
}
