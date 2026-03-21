'use client'

import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Lang = 'en' | 'ka' | 'ru'

interface GrokEmptyStateProps {
  serviceIcon: string
  onSuggestionClick?: (text: string) => void
  activeService?: string
}

const QUICK_PROMPTS: Record<string, { icon: string; label: { en: string; ka: string; ru: string }; prompt: string }[]> = {
  'agent-g': [
    { icon: '👤', label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' }, prompt: 'Create a professional avatar for my brand' },
    { icon: '🎬', label: { en: 'Generate Video', ka: 'ვიდეო გენერაცია', ru: 'Создать видео' }, prompt: 'Generate a cinematic promotional video' },
    { icon: '🖼️', label: { en: 'Design Image', ka: 'სურათის დიზაინი', ru: 'Создать изображение' }, prompt: 'Design a campaign poster for social media' },
    { icon: '🎵', label: { en: 'Compose Music', ka: 'მუსიკის შექმნა', ru: 'Создать музыку' }, prompt: 'Compose background music for a promo video' },
    { icon: '⚡', label: { en: 'Run Pipeline', ka: 'პაიპლაინი', ru: 'Запустить пайплайн' }, prompt: 'Build a workflow: avatar → video → music' },
    { icon: '✍️', label: { en: 'Write Copy', ka: 'ტექსტის წერა', ru: 'Написать текст' }, prompt: 'Write marketing copy for a product launch' },
  ],
  avatar: [
    { icon: '📸', label: { en: 'Scan Face', ka: 'სკანირება', ru: 'Сканировать' }, prompt: 'Scan my face and create an avatar' },
    { icon: '🎨', label: { en: 'Style Avatar', ka: 'სტილი', ru: 'Стиль' }, prompt: 'Create a stylized artistic avatar' },
    { icon: '💼', label: { en: 'Business Avatar', ka: 'ბიზნეს', ru: 'Бизнес' }, prompt: 'Generate a professional business headshot avatar' },
    { icon: '🎬', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, prompt: 'Use my avatar in a video presentation' },
  ],
  video: [
    { icon: '📝', label: { en: 'Text to Video', ka: 'ტექსტი→ვიდეო', ru: 'Текст→Видео' }, prompt: 'Create a video from this description' },
    { icon: '🖼️', label: { en: 'Image to Video', ka: 'სურათი→ვიდეო', ru: 'Фото→Видео' }, prompt: 'Animate this image into a video' },
    { icon: '🎬', label: { en: 'Cinematic Ad', ka: 'კინო რეკლამა', ru: 'Кино-реклама' }, prompt: 'Create a cinematic advertisement' },
    { icon: '🎵', label: { en: 'Add Music', ka: 'მუსიკა', ru: 'Музыка' }, prompt: 'Add background music to my video' },
  ],
  image: [
    { icon: '🎨', label: { en: 'Generate Art', ka: 'ხელოვნება', ru: 'Арт' }, prompt: 'Generate artistic illustration' },
    { icon: '📦', label: { en: 'Product Shot', ka: 'პროდუქტი', ru: 'Продукт' }, prompt: 'Create a professional product photo' },
    { icon: '📱', label: { en: 'Social Post', ka: 'პოსტი', ru: 'Пост' }, prompt: 'Design a social media post image' },
    { icon: '🎬', label: { en: 'Animate', ka: 'ანიმაცია', ru: 'Анимация' }, prompt: 'Animate this image into a short video' },
  ],
  music: [
    { icon: '🎹', label: { en: 'Create Beat', ka: 'ბითი', ru: 'Бит' }, prompt: 'Create an original beat' },
    { icon: '🎬', label: { en: 'Score Video', ka: 'ვიდეოს მუსიკა', ru: 'Музыка к видео' }, prompt: 'Compose a score for my video' },
    { icon: '🎤', label: { en: 'Vocal Track', ka: 'ვოკალი', ru: 'Вокал' }, prompt: 'Generate a vocal track' },
    { icon: '🔊', label: { en: 'Soundscape', ka: 'საუნდსკეიფი', ru: 'Саундскейп' }, prompt: 'Create an ambient soundscape' },
  ],
  text: [
    { icon: '📝', label: { en: 'Marketing Copy', ka: 'მარკეტინგი', ru: 'Маркетинг' }, prompt: 'Write marketing copy for my brand' },
    { icon: '📄', label: { en: 'Script', ka: 'სცენარი', ru: 'Сценарий' }, prompt: 'Write a video script' },
    { icon: '🌐', label: { en: 'Translate', ka: 'თარგმანი', ru: 'Перевод' }, prompt: 'Translate my content to multiple languages' },
    { icon: '📊', label: { en: 'Business Report', ka: 'ანგარიში', ru: 'Отчёт' }, prompt: 'Generate a business report' },
  ],
}

export function GrokEmptyState({ serviceIcon, onSuggestionClick, activeService = 'agent-g' }: GrokEmptyStateProps) {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const prompts = QUICK_PROMPTS[activeService] || QUICK_PROMPTS['agent-g'] || []

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      {/* Animated logo with 4D glow */}
      <div className="grok-empty-logo mb-6">
        <div className="grok-empty-glow" />
        <Image
          src="/brand/gemini-rocket-clean.png"
          alt="MyAvatar.ge"
          width={56}
          height={56}
          className="object-contain relative z-10"
        />
      </div>

      {/* Quick actions grid */}
      {prompts.length > 0 && onSuggestionClick && (
        <div className="w-full max-w-sm">
          <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-center mb-4" style={{ color: 'rgba(34,211,238,0.5)' }}>
            {lang === 'ka' ? 'სწრაფი მოქმედებები' : lang === 'ru' ? 'Быстрые действия' : 'Quick Actions'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {prompts.map(p => (
              <button
                key={p.prompt}
                onClick={() => onSuggestionClick(p.prompt)}
                className="group flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-left transition-all duration-200 active:scale-[0.97] hover:scale-[1.01]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-lg shrink-0">{p.icon}</span>
                <span className="text-[12px] font-medium leading-tight" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {p.label[lang]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
