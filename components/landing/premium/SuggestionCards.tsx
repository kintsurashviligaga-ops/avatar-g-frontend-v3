'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

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
    href: '/services/editing',
  },
  {
    icon: '⬡',
    label: { en: 'Marketing Pack', ka: 'მარკეტინგის პაკეტი', ru: 'Маркетинг-пакет' },
    href: '/services',
  },
  {
    icon: '◎',
    label: { en: 'Business Content', ka: 'ბიზნეს კონტენტი', ru: 'Бизнес-контент' },
    href: '/business',
  },
  {
    icon: 'G',
    label: { en: 'Ask Agent G', ka: 'Agent G-სთან საუბარი', ru: 'Спросить Agent G' },
    href: '/services',
  },
]

export function SuggestionCards() {
  const { language } = useLanguage()
  const router = useRouter()

  return (
    <section className="px-4 sm:px-6 lg:px-10 pb-6 sm:pb-10 animate-[fadeIn_1s_ease-out_0.2s_both]">
      <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {CARDS.map((card, i) => (
          <button
            key={i}
            onClick={() => router.push('/' + language + card.href)}
            className="group flex flex-col items-start gap-2.5 p-3.5 sm:p-5 rounded-2xl bg-white/[0.025] border border-white/[0.05] hover:bg-white/[0.055] hover:border-white/[0.12] transition-all duration-300 text-left cursor-pointer active:scale-[0.97] hover:-translate-y-0.5"
          >
            <span className="text-lg sm:text-xl text-white/20 group-hover:text-white/40 transition-colors duration-300 font-light">
              {card.icon}
            </span>
            <span className="text-[13px] sm:text-sm text-white/50 group-hover:text-white/75 transition-colors duration-300 leading-snug font-medium">
              {card.label[language] || card.label.en}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
