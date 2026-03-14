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

const VALUE_ICONS = [
  /* One Workspace */
  <svg key="ws" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  /* Multi-Modal AI */
  <svg key="mm" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  /* Premium Output */
  <svg key="pq" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  /* Simple Workflow */
  <svg key="sw" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
]

export function ValueStrip() {
  const { language } = useLanguage()

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {{ en: 'Why choose us', ka: 'რატომ ჩვენ', ru: 'Почему мы' }[language] || 'Why choose us'}
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {{ en: 'Why MyAvatar.ge', ka: 'რატომ MyAvatar.ge', ru: 'Почему MyAvatar.ge' }[language] || 'Why MyAvatar.ge'}
          </h2>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {VALUES.map((v, i) => (
            <div
              key={i}
              className="group flex items-start gap-4 p-5 rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
              style={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-shadow duration-300 group-hover:shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {VALUE_ICONS[i]}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[14px] sm:text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  {v.label[language] || v.label.en}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                  {v.desc[language] || v.desc.en}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
