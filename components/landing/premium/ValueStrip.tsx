'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

interface ValueItem {
  label: Record<string, string>
  desc: Record<string, string>
}

const VALUES: ValueItem[] = [
  {
    label: { en: 'One Workspace', ka: 'ერთი სივრცე', ru: 'Одно пространство' },
    desc: { en: 'All creative tools in a single interface', ka: 'ყველა შემოქმედებითი ინსტრუმენტი ერთ ინტერფეისში', ru: 'Все творческие инструменты в одном интерфейсе' },
  },
  {
    label: { en: 'Multi-Modal AI', ka: 'მულტი-მოდალური AI', ru: 'Мультимодальный AI' },
    desc: { en: 'Text, image, video, audio — unified', ka: 'ტექსტი, სურათი, ვიდეო, აუდიო — ერთად', ru: 'Текст, изображения, видео, аудио — вместе' },
  },
  {
    label: { en: 'Premium Output', ka: 'პრემიუმ ხარისხი', ru: 'Премиум-качество' },
    desc: { en: 'Production-ready results every time', ka: 'პროდაქშენ-მზა შედეგები ყოველთვის', ru: 'Готовые к продакшену результаты' },
  },
  {
    label: { en: 'Simple Workflow', ka: 'მარტივი პროცესი', ru: 'Простой процесс' },
    desc: { en: 'From idea to final asset in minutes', ka: 'იდეიდან საბოლოო აქტივამდე წუთებში', ru: 'От идеи до результата за минуты' },
  },
]

export function ValueStrip() {
  const { language } = useLanguage()

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {{ en: 'Why MyAvatar.ge', ka: 'რატომ MyAvatar.ge', ru: 'Почему MyAvatar.ge' }[language] || 'Why MyAvatar.ge'}
          </h2>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {VALUES.map((v, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                <h3 className="text-[14px] sm:text-[15px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {v.label[language] || v.label.en}
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed pl-4" style={{ color: 'var(--color-text-tertiary)' }}>
                {v.desc[language] || v.desc.en}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
