'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    eyebrow: 'How it works',
    title: 'From idea to finished project',
    sub: 'Start with a simple idea. Agent G turns it into a complete project using multi-service automation.',
  },
  ka: {
    eyebrow: 'როგორ მუშაობს',
    title: 'იდეიდან მზა პროექტამდე',
    sub: 'დაიწყეთ მარტივი იდეით. Agent G გადააქცევს მას მთლიან პროექტად მრავალ-სერვისული ავტომატიზაციით.',
  },
  ru: {
    eyebrow: 'Как это работает',
    title: 'От идеи к готовому проекту',
    sub: 'Начните с простой идеи. Agent G превратит её в полноценный проект с помощью мультисервисной автоматизации.',
  },
} as const

const PIPELINE = [
  { icon: '💡', en: 'Idea', ka: 'იდეა', ru: 'Идея' },
  { icon: '👤', en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' },
  { icon: '🎬', en: 'Video', ka: 'ვიდეო', ru: 'Видео' },
  { icon: '🎵', en: 'Music', ka: 'მუსიკა', ru: 'Музыка' },
  { icon: '📦', en: 'Social Pack', ka: 'სოციალური პაკეტი', ru: 'Социальный пакет' },
]

export function WorkflowDemo() {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const c = COPY[lang] || COPY.en

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(99,102,241,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-5xl mx-auto text-center">
        <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
        <p className="mt-4 text-base sm:text-lg max-w-2xl mx-auto mb-14" style={{ color: 'var(--color-text-secondary)' }}>{c.sub}</p>

        {/* Pipeline visual */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {PIPELINE.map((step, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl transition-transform hover:scale-105"
                  style={{
                    backgroundColor: i === 0
                      ? 'var(--color-accent-soft)'
                      : i === PIPELINE.length - 1
                        ? 'var(--color-accent-soft)'
                        : 'var(--card-bg)',
                    border: i === 0 || i === PIPELINE.length - 1
                      ? '1px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    boxShadow: i === 0 || i === PIPELINE.length - 1
                      ? '0 0 30px rgba(99,102,241,0.15)'
                      : 'none',
                  }}
                >
                  {step.icon}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {step[lang] || step.en}
                </span>
              </div>
              {i < PIPELINE.length - 1 && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0 opacity-40">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
