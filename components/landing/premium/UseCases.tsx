'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: { eyebrow: 'Use Cases', title: 'Built for everyone who creates' },
  ka: { eyebrow: 'გამოყენების შემთხვევები', title: 'შექმნილი ყველასთვის, ვინც ქმნის' },
  ru: { eyebrow: 'Сценарии использования', title: 'Создано для каждого, кто творит' },
} as const

const CASES = [
  {
    icon: '🎨',
    title: { en: 'For Creators', ka: 'კრეატორებისთვის', ru: 'Для создателей' },
    desc: { en: 'Create avatars, videos, music, and visual content for your audience.', ka: 'შექმენით ავატარები, ვიდეოები, მუსიკა და ვიზუალური კონტენტი თქვენი აუდიტორიისთვის.', ru: 'Создавайте аватары, видео, музыку и визуальный контент для вашей аудитории.' },
    tools: { en: 'Avatar · Video · Music · Image', ka: 'ავატარი · ვიდეო · მუსიკა · სურათი', ru: 'Аватар · Видео · Музыка · Изображение' },
  },
  {
    icon: '💼',
    title: { en: 'For Businesses', ka: 'ბიზნესისთვის', ru: 'Для бизнеса' },
    desc: { en: 'Generate strategies, marketing content, and business intelligence.', ka: 'შექმენით სტრატეგიები, მარკეტინგული კონტენტი და ბიზნეს ინტელექტი.', ru: 'Генерируйте стратегии, маркетинговый контент и бизнес-аналитику.' },
    tools: { en: 'Business · Text · Media · Shop', ka: 'ბიზნესი · ტექსტი · მედია · მაღაზია', ru: 'Бизнес · Текст · Медиа · Магазин' },
  },
  {
    icon: '💻',
    title: { en: 'For Developers', ka: 'დეველოპერებისთვის', ru: 'Для разработчиков' },
    desc: { en: 'Plan applications, generate code scaffolds, and system architectures.', ka: 'დაგეგმეთ აპლიკაციები, შექმენით კოდის სკაფოლდები და სისტემის არქიტექტურები.', ru: 'Планируйте приложения, генерируйте код и системные архитектуры.' },
    tools: { en: 'Software · Prompt · Workflow · Agent G', ka: 'პროგრამა · პრომპტი · პროცესი · Agent G', ru: 'Программа · Промпт · Процесс · Agent G' },
  },
  {
    icon: '🚀',
    title: { en: 'For Entrepreneurs', ka: 'მეწარმეებისთვის', ru: 'Для предпринимателей' },
    desc: { en: 'Launch stores, build brands, and scale products with AI automation.', ka: 'გაუშვით მაღაზიები, ააშენეთ ბრენდები და გააფართოვეთ პროდუქტები AI ავტომატიზაციით.', ru: 'Запускайте магазины, стройте бренды и масштабируйте продукты с AI.' },
    tools: { en: 'Shop · Business · Tourism · Next', ka: 'მაღაზია · ბიზნესი · ტურიზმი · ექსპანსია', ru: 'Магазин · Бизнес · Туризм · Экспансия' },
  },
]

export function UseCases() {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const c = COPY[lang] || COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(6,182,212,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {CASES.map((cs, i) => (
            <div
              key={i}
              className="group relative p-6 sm:p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
            >
              <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent), 0 0 20px rgba(34,211,238,0.06)' }} />
              <span className="text-3xl mb-4 block">{cs.icon}</span>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>{cs.title[lang] || cs.title.en}</h3>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--color-text-secondary)' }}>{cs.desc[lang] || cs.desc.en}</p>
              <p className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{cs.tools[lang] || cs.tools.en}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
