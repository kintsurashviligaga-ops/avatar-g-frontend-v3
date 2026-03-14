'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: { eyebrow: 'Why MyAvatar.ge', title: 'Built for creators and businesses' },
  ka: { eyebrow: 'რატომ MyAvatar.ge', title: 'შექმნილი კრეატორებისა და ბიზნესისთვის' },
  ru: { eyebrow: 'Почему MyAvatar.ge', title: 'Создано для авторов и бизнеса' },
} as const

const FEATURES = [
  {
    icon: '🎯',
    title: { en: 'All-in-One AI Studio', ka: 'ყოვლისმომცველი AI სტუდია', ru: 'Всё-в-одном AI-студия' },
    desc: { en: 'Every creative and business tool in a single platform', ka: 'ყველა შემოქმედებითი და ბიზნეს ინსტრუმენტი ერთ პლატფორმაზე', ru: 'Все творческие и бизнес-инструменты на одной платформе' },
  },
  {
    icon: '🔗',
    title: { en: 'Multi-Tool Workflows', ka: 'მულტი-ინსტრუმენტის პროცესები', ru: 'Мультиинструментальные процессы' },
    desc: { en: 'Chain services together for complex automated pipelines', ka: 'სერვისების გაერთიანება რთული ავტომატიზებული პროცესებისთვის', ru: 'Объединяйте сервисы для сложных автоматических пайплайнов' },
  },
  {
    icon: '✨',
    title: { en: 'Beginner Friendly', ka: 'დამწყებთათვის მარტივი', ru: 'Простое для начинающих' },
    desc: { en: 'Start creating with simple prompts, no expertise needed', ka: 'დაიწყეთ შექმნა მარტივი მოთხოვნებით, ექსპერტიზა არ სჭირდება', ru: 'Начинайте создавать с простых промптов без экспертизы' },
  },
  {
    icon: '⚡',
    title: { en: 'Advanced Automation', ka: 'გაფართოებული ავტომატიზაცია', ru: 'Продвинутая автоматизация' },
    desc: { en: 'Configure detailed parameters for production-level results', ka: 'პროდაქშენ დონის შედეგებისთვის დეტალური პარამეტრების კონფიგურაცია', ru: 'Настраивайте детальные параметры для профессиональных результатов' },
  },
  {
    icon: '💎',
    title: { en: 'Professional Outputs', ka: 'პროფესიონალური შედეგები', ru: 'Профессиональные результаты' },
    desc: { en: 'Campaign-ready content that meets commercial standards', ka: 'კამპანიისთვის მზა კონტენტი, რომელიც აკმაყოფილებს კომერციულ სტანდარტებს', ru: 'Контент коммерческого качества для кампаний' },
  },
  {
    icon: '🌍',
    title: { en: 'Multilingual Platform', ka: 'მრავალენოვანი პლატფორმა', ru: 'Мультиязычная платформа' },
    desc: { en: 'Full support for English, Georgian, and Russian', ka: 'სრული მხარდაჭერა ინგლისურ, ქართულ და რუსულ ენებზე', ru: 'Полная поддержка английского, грузинского и русского' },
  },
]

export function FeatureHighlights() {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const c = COPY[lang] || COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="group relative p-6 sm:p-7 rounded-2xl transition-all duration-300 hover:-translate-y-1"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
            >
              <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 20px rgba(34,211,238,0.06)' }} />
              <span className="text-2xl mb-4 block">{f.icon}</span>
              <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>{f.title[lang] || f.title.en}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{f.desc[lang] || f.desc.en}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
