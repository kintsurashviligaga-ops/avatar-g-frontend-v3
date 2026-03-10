'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ServiceCardVisual } from '@/components/ui/ServiceCardVisual'

interface Card {
  icon: string
  label: Record<string, string>
  href: string
}

const CARDS: Card[] = [
  {
    icon: '✦',
    label: { en: 'Create My Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' },
    href: '/services/avatar',
  },
  {
    icon: '◆',
    label: { en: 'Generate an Image', ka: 'სურათის გენერაცია', ru: 'Сгенерировать изображение' },
    href: '/services/image',
  },
  {
    icon: '▶',
    label: { en: 'Make a Short Video', ka: 'მოკლე ვიდეოს შექმნა', ru: 'Создать короткое видео' },
    href: '/services/video',
  },
  {
    icon: '♪',
    label: { en: 'Compose a Beat', ka: 'მუსიკის შექმნა', ru: 'Сочинить бит' },
    href: '/services/music',
  },
  {
    icon: '◈',
    label: { en: 'Enhance My Photo', ka: 'ფოტოს გაუმჯობესება', ru: 'Улучить фото' },
    href: '/services/photo',
  },
  {
    icon: '⬡',
    label: { en: 'Media Production', ka: 'მედია პროდაქშენი', ru: 'Медиа-продакшн' },
    href: '/services/media',
  },
  {
    icon: '◎',
    label: { en: 'Business Content', ka: 'ბიზნეს კონტენტი', ru: 'Бизнес-контент' },
    href: '/services/business',
  },
  {
    icon: 'G',
    label: { en: 'Ask Agent G', ka: 'Agent G-სთან საუბარი', ru: 'Спросить Agent G' },
    href: '/services/agent-g',
  },
]

export function SuggestionCards() {
  const { language } = useLanguage()
  const router = useRouter()

  const SLUG_MAP: Record<string, string> = {
    '/services/avatar': 'avatar',
    '/services/image': 'image',
    '/services/video': 'video',
    '/services/music': 'music',
    '/services/photo': 'photo',
    '/services/media': 'media',
    '/services/business': 'business',
    '/services/agent-g': 'agent-g',
  }

  return (
    <section className="px-4 sm:px-6 lg:px-10 pb-6 sm:pb-10">
      <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {CARDS.map((card, i) => (
          <button
            key={i}
            onClick={() => router.push('/' + language + card.href)}
            className="group flex flex-col overflow-hidden rounded-xl transition-all duration-200 text-left cursor-pointer active:scale-[0.98] hover:-translate-y-0.5"
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--color-border)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--card-hover)'
              e.currentTarget.style.borderColor = 'var(--color-border-hover)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--card-bg)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            <ServiceCardVisual serviceId={SLUG_MAP[card.href] || ''} variant="thumb" />
            <div className="flex flex-col items-start gap-2 p-3.5 sm:p-4">
              <span className="text-[13px] leading-snug font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {card.label[language] || card.label.en}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
