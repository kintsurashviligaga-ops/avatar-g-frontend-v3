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
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-1 pb-1 justify-center flex-wrap">
      {items.map(a => (
        <button
          key={a.id}
          onClick={() => onAction(a)}
          className="chat-chip"
        >
          <span className="text-sm">{a.icon}</span>
          <span>{a.label[lang] || a.label.en}</span>
        </button>
      ))}
    </div>
  )
}
